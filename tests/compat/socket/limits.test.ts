// Capacity limits a peer can reach: `maxPayload` per connection and at the boundary,
// the configured fragment count, and the inbound queue's `maxBufferedChunks`.

import { expect, test } from "vitest";
import { WebSocketServer, type WebSocket } from "../../../src/index";
import { socketStateOf } from "../../../src/compat/socket/state";
import { ingest } from "../../../src/compat/socket/codec-inbound";
import type { CodedError } from "../../../src/types/errors";
import type { RawData } from "../../../src/index";
import { TEST_TIMEOUT_MS } from "../../binding/support";
import { clientFrames } from "./client-frames";
import { nextSocket, openClient, upgradeHarness } from "./codec-upgrade-support";
import { openRawClient } from "../handshake";

const SMALL = 1024;

function payloadLength(data: RawData): number {
  if (Array.isArray(data)) return data.reduce((total, part) => total + part.length, 0);

  return data instanceof ArrayBuffer ? data.byteLength : data.length;
}

test(
  "a message at maxPayload is delivered and one byte over is closed 1009",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const harness = await upgradeHarness(
      new WebSocketServer({ noServer: true, maxPayload: SMALL }),
    );

    const accepted = nextSocket(harness.server);
    const client = await openClient(harness.url);

    try {
      const socket = await accepted;

      const received = new Promise<number>((resolve) => {
        socket.on("message", (data) => resolve(payloadLength(data)));
      });

      client.send(Buffer.alloc(SMALL, "x"));
      expect(await received).toBe(SMALL);

      const events: string[] = [];
      socket.on("error", () => events.push("error"));
      const closed = new Promise<number>((resolve) => socket.on("close", (code) => resolve(code)));
      client.send(Buffer.alloc(SMALL + 1));
      expect(await closed).toBe(1009);
      expect(events).toEqual(["error"]);
    } finally {
      client.terminate();
      await harness.close();
    }
  },
);

test(
  "two connections carry different maxPayload values",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const strict = await upgradeHarness(new WebSocketServer({ noServer: true, maxPayload: SMALL }));

    const roomy = await upgradeHarness(
      new WebSocketServer({ noServer: true, maxPayload: 8 * SMALL }),
    );

    const strictAccepted = nextSocket(strict.server);
    const roomyAccepted = nextSocket(roomy.server);
    const strictClient = await openClient(strict.url);
    const roomyClient = await openClient(roomy.url);

    try {
      const strictSocket = await strictAccepted;
      const roomySocket = await roomyAccepted;
      strictSocket.on("error", () => undefined);
      const strictClosed = new Promise<number>((resolve) => strictSocket.on("close", resolve));

      const roomyDelivered = new Promise<number>((resolve) => {
        roomySocket.on("message", (data) => resolve(payloadLength(data)));
      });

      const payload = Buffer.alloc(4 * SMALL, "y");
      strictClient.send(payload);
      roomyClient.send(payload);
      expect(await strictClosed).toBe(1009);
      expect(await roomyDelivered).toBe(payload.length);
    } finally {
      strictClient.terminate();
      roomyClient.terminate();
      await strict.close();
      await roomy.close();
    }
  },
);

test("more fragments than maxFragments is closed 1008", { timeout: TEST_TIMEOUT_MS }, async () => {
  const harness = await upgradeHarness(new WebSocketServer({ noServer: true, maxFragments: 2 }));
  const accepted = nextSocket(harness.server);
  const client = await openClient(harness.url);

  try {
    const socket = await accepted;
    socket.on("error", () => undefined);
    const closed = new Promise<number>((resolve) => socket.on("close", resolve));

    for (let piece = 0; piece < 4; piece += 1) {
      client.send("ab", { fin: piece === 3 });
    }

    expect(await closed).toBe(1008);
  } finally {
    client.terminate();
    await harness.close();
  }
});

test(
  "the inbound queue refuses the connection at maxBufferedChunks",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    // A bound of two, driven directly: over a socket the reads coalesce and the pause
    // drains one per tick, so only a caller queuing faster than it drains reaches it.
    const harness = await upgradeHarness();
    const accepted = nextSocket(harness.server);
    const raw = await openRawClient(harness.port);

    try {
      const socket: WebSocket = await accepted;
      const state = socketStateOf(socket);
      expect(state).toBeDefined();

      if (state === undefined) return;
      socket.on("error", () => undefined);
      const failure = new Promise<CodedError>((resolve) => socket.once("error", resolve));
      state.deliveryPaused = true;
      state.maxBufferedChunks = 2;
      state.pendingInput.push(Buffer.alloc(0), Buffer.alloc(0));
      expect(state.pendingInput).toHaveLength(2);
      ingest(state, clientFrames([{ opcode: 0x1, payload: Buffer.from("m0") }]));
      expect((await failure).code).toBe("WS_ERR_TOO_MANY_BUFFERED_PARTS");
      expect(state.pendingInput).toHaveLength(0);
    } finally {
      raw.destroy();
      await harness.close();
    }
  },
);
