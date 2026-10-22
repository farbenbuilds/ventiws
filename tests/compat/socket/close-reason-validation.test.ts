// The close reason values refused before anything is sent: a typed array that is not a
// `Uint8Array`, and a reason longer than the 123-byte control-frame budget.

import { expect, test } from "vitest";
import { TEST_TIMEOUT_MS } from "../../binding/support";
import { attached, terminateClient } from "./socket-support";

/// Pins GHSA-58qx-3vcg-4xpx: a `Float32Array` reports an element count smaller than its
/// `byteLength`, so accepting it would size a frame from bytes never written. The refusal
/// precedes the `CLOSING` latch (`ws` 8.22.0, #2337), so the socket stays `OPEN`.
test(
  "a typed array that is not a Uint8Array is refused as a close reason",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const { server, client, socket } = await attached();

    try {
      // SAFETY: a `Float32Array` is the deliberate non-`Uint8Array` fixture `ws` refuses.
      expect(() => socket.close(1000, new Float32Array(20) as never)).toThrow(
        "Second argument must be a string or a Uint8Array",
      );
      expect(socket.readyState).toBe(socket.OPEN);
    } finally {
      terminateClient(client);
      await server.dispose();
    }
  },
);

/// A 124-byte reason exceeds the 123-byte control-frame budget and is refused before any
/// frame is staged, leaving the socket `OPEN`.
test("an oversize close reason is refused", { timeout: TEST_TIMEOUT_MS }, async () => {
  const { server, client, socket } = await attached();

  try {
    expect(() => socket.close(1000, "a".repeat(124))).toThrow(RangeError);
    expect(socket.readyState).toBe(socket.OPEN);
  } finally {
    terminateClient(client);
    await server.dispose();
  }
});
