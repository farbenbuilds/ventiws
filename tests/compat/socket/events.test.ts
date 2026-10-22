// Event timing and teardown: `allowSynchronousEvents`, a read that arrives during a
// deferred delivery, a dead transport, and a listener that throws during dispatch.

import { Duplex } from "node:stream";
import { expect, test } from "vitest";
import { attachSocket } from "../../../src/compat/socket/attach";
import { socketStateOf } from "../../../src/compat/socket/state";
import { WebSocket, WebSocketServer } from "../../../src/index";
import { TEST_TIMEOUT_MS } from "../../binding/support";
import { clientFrames } from "./client-frames";
import { openRawClient } from "../handshake";
import { nextSocket, upgradeHarness, waitFor } from "./codec-upgrade-support";

const BATCH = clientFrames([
  { opcode: 0x1, payload: Buffer.from("one") },
  { opcode: 0x1, payload: Buffer.from("two") },
  { opcode: 0x1, payload: Buffer.from("three") },
]);

/// The turn index advances only when this loop advances it, so the answer is whether
/// the messages shared a turn, not how late the transport was.
async function turnsFor(server: WebSocketServer, count: number): Promise<number> {
  const harness = await upgradeHarness(server);
  const accepted = nextSocket(server);
  const raw = await openRawClient(harness.port);

  try {
    const socket = await accepted;
    const arrivals: number[] = [];
    let turn = 0;
    socket.on("message", () => arrivals.push(turn));
    socket.on("error", () => undefined);
    raw.write(BATCH);

    for (let step = 0; step < 40 && arrivals.length < count; step += 1) {
      turn += 1;
      await new Promise<void>((resolve) => setImmediate(resolve));
    }

    await waitFor(() => arrivals.length === count);

    return new Set(arrivals).size;
  } finally {
    raw.destroy();
    await harness.close();
  }
}

test("the default delivers every message in one turn", { timeout: TEST_TIMEOUT_MS }, async () => {
  const server = new WebSocketServer({ noServer: true });

  try {
    expect(await turnsFor(server, 3)).toBe(1);
  } finally {
    server.close();
  }
});

test("false puts each message on its own turn", { timeout: TEST_TIMEOUT_MS }, async () => {
  const server = new WebSocketServer({ noServer: true, allowSynchronousEvents: false });

  try {
    expect(await turnsFor(server, 3)).toBe(3);
  } finally {
    server.close();
  }
});

test(
  "a transport that is already gone is not adopted as a connection",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const harness = await upgradeHarness();

    const stream = new Duplex({
      read: () => undefined,
      write: (_chunk, _encoding, callback) => callback(null),
    });

    stream.destroy();

    try {
      const socket = new WebSocket("ws://example.invalid/");
      attachSocket(socket, stream);

      const outcome = new Promise<string>((resolve) => {
        socket.on("error", (error: Error & { code?: string }) => resolve(error.code ?? "ERR_NONE"));
        socket.on("close", () => resolve("CLOSED_WITHOUT_ERROR"));
      });

      expect(await outcome).toBe("ERR_INVALID_STATE");
      expect(socket.readyState).toBe(WebSocket.CLOSED);
    } finally {
      await harness.close();
    }
  },
);

test(
  "a throwing listener still releases the codec slot",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const uncaught: string[] = [];
    const swallow: NodeJS.UncaughtExceptionListener = (error) => void uncaught.push(error.message);
    process.on("uncaughtException", swallow);
    const harness = await upgradeHarness();

    try {
      const accepted = nextSocket(harness.server);
      const raw = await openRawClient(harness.port);
      const socket = await accepted;
      const state = socketStateOf(socket);
      socket.on("message", () => {
        throw new Error("the application's own failure");
      });
      const drained = new Promise<number>((resolve) => socket.on("close", resolve));
      raw.write(clientFrames([{ opcode: 0x1, payload: Buffer.from("hi") }]));
      expect(await drained).toBe(1006);
      expect(uncaught).toEqual(["the application's own failure"]);
      expect(state?.codec).toBeNull();
    } finally {
      process.off("uncaughtException", swallow);
      await harness.close();
    }
  },
);
