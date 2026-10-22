// Frames on the Node upgrade route: both message directions, fragmentation, a frame
// coalesced with the upgrade request, and control frames.

import { connect } from "node:net";
import { expect, test } from "vitest";
import { WebSocketServer } from "../../../src/index";
import type { ServerOptions } from "../../../src/types/ws";
import { TEST_TIMEOUT_MS } from "../../binding/support";
import { clientFrames } from "./client-frames";
import { openRawClient } from "../handshake";
import { request, UPGRADE_HEADERS } from "../server/upgrade-support";
import { maskedFrame } from "./raw-peer";
import { nextSocket, openClient, upgradeHarness, waitFor } from "./codec-upgrade-support";

function serverWith(options: ServerOptions): WebSocketServer {
  return new WebSocketServer({ noServer: true, ...options });
}

test(
  "a ws client's message reaches the socket with its binary flag",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const harness = await upgradeHarness();
    const accepted = nextSocket(harness.server);
    const client = await openClient(harness.url);

    try {
      const socket = await accepted;
      const messages: Array<[string, boolean]> = [];
      socket.on("message", (data, isBinary) => messages.push([data.toString("latin1"), isBinary]));
      client.send("hello");
      client.send(Buffer.from([0, 1, 2, 255]));
      await waitFor(() => messages.length === 2);
      // `ws` hands Node listeners a Buffer for both kinds and marks binary separately.
      expect(messages[0]).toEqual(["hello", false]);
      expect(messages[1]).toEqual(["\u0000\u0001\u0002\u00ff", true]);
    } finally {
      client.terminate();
      await harness.close();
    }
  },
);

test(
  "a fragmented message is reassembled before delivery",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const harness = await upgradeHarness();
    const accepted = nextSocket(harness.server);
    const raw = await openRawClient(harness.port);

    try {
      const socket = await accepted;
      const messages: string[] = [];
      socket.on("message", (data) => messages.push(data.toString()));
      raw.write(
        clientFrames([
          { opcode: 0x1, payload: Buffer.from("x".repeat(8_000)), fin: false },
          { opcode: 0x0, payload: Buffer.from("y".repeat(8_000)) },
        ]),
      );
      await waitFor(() => messages.length === 1);
      expect(messages[0]).toBe("x".repeat(8_000) + "y".repeat(8_000));
    } finally {
      raw.destroy();
      await harness.close();
    }
  },
);

test(
  "a frame coalesced with the upgrade request is delivered",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    // Asynchronous events leave the listener a tick to attach before the pending bytes feed.
    const server = new WebSocketServer({ noServer: true, allowSynchronousEvents: false });
    const harness = await upgradeHarness(server);
    const messages: string[] = [];
    server.on("connection", (socket) => {
      socket.on("message", (data) => messages.push(data.toString()));
    });
    const socket = connect(harness.port, "127.0.0.1");
    socket.on("error", () => undefined);

    try {
      await new Promise<void>((resolve) => socket.once("connect", resolve));
      socket.write(
        Buffer.concat([
          Buffer.from(request("/", UPGRADE_HEADERS)),
          maskedFrame(0x1, Buffer.from("early")),
        ]),
      );
      await waitFor(() => messages.length === 1);
      expect(messages[0]).toBe("early");
    } finally {
      socket.destroy();
      await harness.close();
    }
  },
);

test(
  "a ping is answered with a pong and reported to the socket",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const harness = await upgradeHarness();
    const accepted = nextSocket(harness.server);
    const client = await openClient(harness.url);

    try {
      const socket = await accepted;
      const pings: string[] = [];
      const clientPongs: string[] = [];
      socket.on("ping", (data) => pings.push(data.toString()));
      client.on("pong", (data) => clientPongs.push(data.toString()));
      client.ping("beat");
      // RFC 6455 section 5.5.2 requires the pong without the application calling `pong`.
      await waitFor(() => pings.length === 1 && clientPongs.length === 1);
      expect(pings[0]).toBe("beat");
      expect(clientPongs[0]).toBe("beat");
    } finally {
      client.terminate();
      await harness.close();
    }
  },
);

test("autoPong false suppresses the automatic answer", { timeout: TEST_TIMEOUT_MS }, async () => {
  const server = serverWith({ autoPong: false });
  const harness = await upgradeHarness(server);
  const accepted = nextSocket(server);
  const client = await openClient(harness.url);

  try {
    await accepted;
    const pongs: Buffer[] = [];
    client.on("pong", (data: Buffer) => pongs.push(data));
    client.ping(Buffer.from("hi"));
    await new Promise<void>((resolve) => setTimeout(resolve, 150));
    expect(pongs).toEqual([]);
  } finally {
    client.terminate();
    await harness.close();
  }
});
