import { serverDroppedMessages } from "../../src/binding/server";
import { expect, test } from "vitest";
import { blockEventLoop, collect, connect, opened } from "./echo-client";
import { startEcho } from "./echo-support";

const TEST_TIMEOUT_MS = 20_000;

test(
  "echoes a burst within the inbound budget without dropping a message",
  async () => {
    const echo = await startEcho();
    const client = connect(echo.port);
    // The inbound ring is the burst budget, and the engine's WebSocket behavior
    // has no hook to stop reading when a consumer falls behind, so a peer that
    // delivers more than this in one burst has the excess counted as dropped.
    // `inbound_slots` in `src/engine/server/instance.zig` is the source of truth.
    const count = 64;

    try {
      await opened(client);
      const received = collect(client, count);

      for (let index = 0; index < count; index += 1) {
        client.send(`message-${index}`);
      }

      const replies = await received;
      const expected = Array.from({ length: count }, (_unused, index) => `message-${index}`);
      expect(replies.map((reply) => reply.bytes.toString("utf8"))).toEqual(expected);
      expect(serverDroppedMessages(echo.handle)).toBe(0n);
    } finally {
      client.close();
      await echo.dispose();
    }
  },
  TEST_TIMEOUT_MS,
);

test(
  "counts inbound messages dropped when the consumer stops draining",
  async () => {
    const echo = await startEcho();
    const client = connect(echo.port);
    // Comfortably past the ring depth, so the overflow is a certainty rather
    // than a race against how fast the main thread happens to drain.
    const count = 256;

    try {
      await opened(client);

      for (let index = 0; index < count; index += 1) {
        client.send(`message-${index}`);
      }

      blockEventLoop(400);
      const dropped = serverDroppedMessages(echo.handle);
      expect(dropped).toBeGreaterThan(0n);
      expect(dropped).toBeLessThanOrEqual(BigInt(count));
      // Whatever did fit is still waiting in the ring rather than lost, so the
      // loss is bounded by the buffer and does not corrupt the stream.
      expect(dropped + BigInt(echo.received.length)).toBeLessThanOrEqual(BigInt(count));
    } finally {
      client.close();
      await echo.dispose();
    }
  },
  TEST_TIMEOUT_MS,
);
