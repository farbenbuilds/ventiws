// Server-side close: the handshake, the code and reason on the wire, the deadline,
// exactly-once delivery, and the engine route's known missing close frame.

import { Duplex } from "node:stream";
import { expect, test } from "vitest";
import type { ServerOptions } from "../../../src/types/ws";
import { attachSocket } from "../../../src/compat/socket/attach";
import { closeFrameWritten } from "../../../src/compat/socket/lifecycle";
import { WebSocket, WebSocketServer } from "../../../src/index";
import { TEST_TIMEOUT_MS } from "../../binding/support";
import { openRawClient } from "../handshake";
import { serve } from "../server/upgrade-support";
import { nextSocket, openClient, upgradeHarness } from "./codec-upgrade-support";
import { attached, terminateClient } from "./socket-support";

type RuntimeServerOptions = ServerOptions & {
  readonly closeTimeout?: number;
};

test(
  "a fractional close code truncates toward zero before framing",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const harness = await upgradeHarness();
    const accepted = nextSocket(harness.server);
    const client = await openClient(harness.url);

    try {
      const socket = await accepted;

      const closed = new Promise<[number, string]>((resolve) => {
        socket.on("close", (code, reason) => resolve([code, reason.toString()]));
      });

      socket.close(1000, "bye");
      expect(await closed).toEqual([1000, "bye"]);
    } finally {
      client.terminate();
      await harness.close();
    }
  },
);

test(
  "a close from the peer is answered and reported cleanly",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const harness = await upgradeHarness();
    const accepted = nextSocket(harness.server);
    const client = await openClient(harness.url);

    try {
      const socket = await accepted;

      const closed = new Promise<[number, string]>((resolve) => {
        socket.on("close", (code, reason) => resolve([code, reason.toString()]));
      });

      client.close(1001, "going away");
      expect(await closed).toEqual([1001, "going away"]);
    } finally {
      client.terminate();
      await harness.close();
    }
  },
);

test(
  "a server socket with no peer to answer is torn down",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const options: RuntimeServerOptions = { noServer: true, closeTimeout: 150 };
    const server = new WebSocketServer(options);
    const harness = await serve(server);

    try {
      const accepted = new Promise<WebSocket>((resolve) => server.once("connection", resolve));
      const raw = await openRawClient(harness.port);
      const socket = await accepted;
      const closed = new Promise<number>((resolve) => socket.on("close", resolve));
      socket.close(1000, "bye");
      expect(socket.readyState).toBe(WebSocket.CLOSING);
      expect(await closed).toBe(1006);
      expect(socket.readyState).toBe(WebSocket.CLOSED);
      raw.destroy();
    } finally {
      await harness.close();
    }
  },
);

/// `closeTimeout: 0` is `setTimeout(fn, 0)` in `ws`, not "no deadline".
test(
  "an unsupported engine-route close reports once and leaves the socket OPEN",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const { server, client, socket } = await attached();

    try {
      const errors: Error[] = [];
      socket.on("error", (error) => errors.push(error));
      socket.close(1000, "done");
      socket.close(1000, "done");
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({ code: "ERR_POLICY_VIOLATION" });
      expect(socket.readyState).toBe(WebSocket.OPEN);
      expect(closeFrameWritten(socket)).toBe(false);
    } finally {
      terminateClient(client);
      await server.dispose();
    }
  },
);

function upgradedSocket() {
  const socket = new WebSocket(null);

  const transport = new Duplex({
    read: () => undefined,
    write: (_chunk, _encoding, callback) => callback(null),
  });

  attachSocket(socket, transport);

  return { socket, transport };
}

test("close on an upgraded socket reaches CLOSED and fires exactly once", () => {
  const { socket, transport } = upgradedSocket();
  let count = 0;
  socket.on("close", () => {
    count += 1;
  });
  socket.close();
  transport.emit("close");
  socket.close();
  socket.terminate();
  transport.emit("close");
  expect(count).toBe(1);
  expect(socket.readyState).toBe(WebSocket.CLOSED);
});
