// `bufferedAmount` and the cost of a peer that does not read. The absolute figure is
// run-dependent; the marginal frame cost and the bound are the contract.

import { WebSocket as WsSocket, WebSocketServer as WsServer } from "ws";
import { expect, test } from "vitest";
import { WebSocket, WebSocketServer } from "../../../src/index";
import { TEST_TIMEOUT_MS } from "../../binding/support";
import { boundPort } from "../address-support";
import { openWithPeer, waitFor } from "./client-support";
import { scriptedPeer } from "./redirect-peer";

/// 65536 payload plus 14 bytes of client framing: two header bytes, the 8-byte length
/// (RFC 6455 section 5.2), and the 4-byte masking key (section 5.3).
const PAYLOAD = 64 * 1024;
const FRAME = PAYLOAD + 14;
const SENDS = 200;

type Make = () => [WsServer, (port: number) => WsSocket];

type Burst = { readonly deltas: number[]; readonly final: number };

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

    if (index > 0) deltas.push(final - previous);
    previous = final;
  }

  client.terminate();
  peer.terminate();
  await new Promise<void>((resolve) => server.close(() => resolve()));

  return { deltas, final };
}

test(
  "bufferedAmount counts every framed byte of a burst as ws does",
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

    for (const leg of [reference, ours]) {
      // A step is nothing, because the kernel took the frame, or exactly one frame.
      expect([...new Set(leg.deltas)].sort()).toEqual([0, FRAME]);
      expect(leg.final % FRAME).toBe(0);
      expect(leg.final).toBeGreaterThan(FRAME * 100);
      expect(leg.final).toBeLessThan(FRAME * SENDS);
    }

    expect(ours.final).toBe(reference.final);
    expect(ours.deltas).toEqual(reference.deltas);
  },
);

test(
  "a peer that never reads costs the writer a bounded queue",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    // A peer that completes the handshake and then never reads is a slow consumer; the
    // queue must stop growing once the kernel buffer is full.
    const peer = await scriptedPeer({ first: 101, after: 101 });
    const socket = new WebSocket(peer.url);

    try {
      await new Promise<void>((resolve, reject) => {
        socket.once("open", resolve);
        socket.once("error", reject);
      });
      const payload = Buffer.alloc(16 * 1024);
      let reported = 0;

      for (let index = 0; index < 200; index += 1) {
        socket.send(payload);
        reported = Math.max(reported, socket.bufferedAmount);
      }

      expect(reported).toBeGreaterThan(0);
      expect(reported).toBeLessThan(64 * 1024 * 1024);
    } finally {
      socket.terminate();
      await peer.close();
    }
  },
);

test("an oversized send is refused and costs no memory", { timeout: TEST_TIMEOUT_MS }, async () => {
  // The cap is the option, not a compiled constant, so a test can reach it.
  const maxPayload = 64 * 1024;

  const { socket, harness } = await openWithPeer(
    (peer) => {
      peer.on("message", (data) => peer.send(data));
    },
    undefined,
    undefined,
    { maxPayload },
  );

  try {
    const failures: Error[] = [];
    socket.on("error", (error) => failures.push(error));
    socket.send(Buffer.alloc(maxPayload + 1), (error) => {
      if (error) failures.push(error);
    });
    await waitFor(() => failures.length > 0);
    expect(failures[0]?.message).toContain("payload-too-large");
    expect(socket.bufferedAmount).toBe(0);
    expect(socket.readyState).toBe(WebSocket.OPEN);

    const echoed: string[] = [];
    socket.on("message", (data) => echoed.push(data.toString()));
    socket.send("still working");
    await waitFor(() => echoed.length === 1);
    expect(echoed[0]).toBe("still working");
  } finally {
    socket.terminate();
    await harness.close();
  }
});
