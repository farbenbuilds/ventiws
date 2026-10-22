// What a server-side socket reports for `url`: `ws` only assigns `_url` in `initAsClient`
// (`websocket.js:719`), so an accepted socket returns `undefined` (`websocket.js:190`) while
// `@types/ws` declares `readonly url: string`. ventiws starts the field at `""`
// (`src/compat/socket/state.ts:40`). Recorded rather than fixed: the honest type is
// `string | undefined`, and the field and its getter are outside this suite.

import { WebSocket as WsSocket, WebSocketServer as WsServer } from "ws";
import { expect, test } from "vitest";
import { WebSocket, WebSocketServer } from "../../../src/index";
import { boundPort } from "../address-support";
import { TEST_TIMEOUT_MS } from "../../binding/support";

/// A server and the client that dials it, so one leg of the comparison is one pair.
type Leg = [WsServer, (port: number) => WsSocket];

/// Connects a client to a fresh server and reports what the accepted socket holds for `url`.
/// The `connection` listener exists before the client, because a local handshake can land first.
async function observed(make: () => Leg): Promise<{ url: string; present: boolean }> {
  const [server, clientFor] = make();

  const connected = new Promise<WsSocket>((resolve) => {
    server.once("connection", resolve);
  });

  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const client = clientFor(boundPort(server.address()));
  const peer = await connected;
  await new Promise<void>((resolve) => client.once("open", () => resolve()));
  const seen = { url: peer.url, present: "url" in peer };
  client.terminate();
  peer.terminate();
  await new Promise<void>((resolve) => server.close(() => resolve()));

  return seen;
}

test(
  "a server socket reports undefined in ws and an empty string in ventiws",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const reference = await observed(() => [
      new WsServer({ port: 0 }),
      (port) => new WsSocket(`ws://127.0.0.1:${port}/`),
    ]);

    const ours = await observed(() => [
      new WebSocketServer({ port: 0 }),
      (port) => new WebSocket(`ws://127.0.0.1:${port}/`),
    ]);

    // The key exists on both, so `("url" in socket)` cannot tell a caller which library it
    // is holding; only the value does.
    expect(reference.present).toBe(true);
    expect(reference.url).toBeUndefined();
    expect(ours.present).toBe(true);
    expect(ours.url).toBe("");
  },
);
