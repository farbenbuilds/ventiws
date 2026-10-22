// What `bufferedAmount` counts on a client, measured against `ws` while a peer stalls.
//
// `ws` reports `socket._writableState.length + sender._bufferedBytes`, which is every
// byte of the connection that has not reached the kernel yet, framing included.
// ventiws reads the transport's own queue (`src/compat/socket/payload.ts`), which is the
// Node stream's `writableLength` and therefore the same queue for the client route.
// The absolute figure is not assertable: the kernel takes a run-dependent number of
// frames before its send buffer fills, and both libraries see that run. The marginal
// cost of one message is, and it says whether a caller polling this number can trust it.

import { WebSocket as WsSocket, WebSocketServer as WsServer } from "ws";
import { expect, test } from "vitest";
import { WebSocket, WebSocketServer } from "../../../src/index";
import { boundPort } from "../address-support";
import { TEST_TIMEOUT_MS } from "../../binding/support";

/// 65536 payload plus 14 bytes of client framing: two header bytes, the 8-byte length a
/// client frame needs because 65536 does not fit the 2-byte form (RFC 6455 section 5.2),
/// and the 4-byte masking key RFC 6455 section 5.3 requires of a client.
const PAYLOAD = 64 * 1024;
const FRAME = PAYLOAD + 14;
const SENDS = 200;

type Make = () => [WsServer, (port: number) => WsSocket];

type Burst = { readonly deltas: number[]; readonly final: number };

/// The one scenario: a peer that accepts and then reads nothing, and a burst that cannot
/// fit in the kernel's send buffer.
async function burst(make: Make): Promise<Burst> {
  const [server, clientFor] = make();
  const accepted = new Promise<WsSocket>((resolve) => server.once("connection", resolve));
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const client = clientFor(boundPort(server.address()));
  await new Promise<void>((resolve) => client.once("open", () => resolve()));
  const peer = await accepted;
  peer.pause();
  const deltas: number[] = [];
  let previous = 0;
  let final = 0;

  for (let index = 0; index < SENDS; index += 1) {
    client.send("x".repeat(PAYLOAD));
    final = client.bufferedAmount;

    // The first send's step is its whole total, which the series below starts after.
    if (index > 0) deltas.push(final - previous);
    previous = final;
  }

  client.terminate();
  peer.terminate();
  await new Promise<void>((resolve) => server.close(() => resolve()));

  return { deltas, final };
}

test(
  "bufferedAmount counts every framed byte of a burst exactly as ws does",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const reference = await burst(() => [
      new WsServer({ port: 0 }),
      (port) => new WsSocket(`ws://127.0.0.1:${port}/`),
    ]);

    const ours = await burst(() => [
      new WebSocketServer({ port: 0 }),
      (port) => new WebSocket(`ws://127.0.0.1:${port}/`),
    ]);

    // A step is either nothing, because the kernel took that frame whole, or exactly one
    // frame. Anything else is a frame counted twice, or a payload-only count that drops
    // the 14 bytes of header a caller is actually paying to move.
    for (const leg of [reference, ours]) {
      expect([...new Set(leg.deltas)].sort()).toEqual([0, FRAME]);
      // The queue holds whole frames, so the figure is a multiple of one frame's bytes.
      // This is the assertion a per-message overhead change cannot pass: dropping the 14
      // header bytes off the total leaves the deltas alone and breaks the multiple.
      expect(leg.final % FRAME).toBe(0);
      // Under-reporting is the failure that matters: a caller that stops sending on this
      // number and reads a smaller one than is queued loses data. Measured 10,619,100 of
      // 13,110,000 sent, the rest already in the kernel's hands.
      expect(leg.final).toBeGreaterThan(FRAME * 100);
      expect(leg.final).toBeLessThan(FRAME * SENDS);
    }

    // The parity claim itself: two clients, one host, one stalled peer, one number.
    expect(ours.final).toBe(reference.final);
    expect(ours.deltas).toEqual(reference.deltas);
  },
);
