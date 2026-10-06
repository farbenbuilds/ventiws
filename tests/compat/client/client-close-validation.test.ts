// `close()` argument validation, in the order `ws` 8.22.0 settled: `Sender.close` refuses
// an invalid argument before the socket latches `CLOSING` (#2337), so a refused call
// leaves it `OPEN` and a following valid close still runs. Latching first stranded the
// socket at `CLOSING`, which is what `tests/conformance/close.conformance.test.ts`
// compares after a throw.

import { expect, test } from "vitest";
import { WebSocket } from "../../../src/index";
import { TEST_TIMEOUT_MS } from "../../binding/support";
import { openWithPeer } from "./client-support";

test(
  "a refused close leaves the socket OPEN and a valid close still runs",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const { socket, harness } = await openWithPeer(() => undefined);
    const closed = new Promise<[number, string]>((resolve) => {
      socket.on("close", (code, reason) => resolve([code, reason.toString()]));
    });
    try {
      // A reserved code fails the code check, an oversized reason fails the reason check,
      // and neither may disturb the state the other one left.
      expect(() => socket.close(1005)).toThrow(TypeError);
      expect(socket.readyState).toBe(WebSocket.OPEN);
      expect(() => socket.close(1000, "a".repeat(124))).toThrow(RangeError);
      expect(socket.readyState).toBe(WebSocket.OPEN);
      socket.close(1000, "ok");
      expect(socket.readyState).toBe(WebSocket.CLOSING);
      expect(await closed).toEqual([1000, "ok"]);
    } finally {
      await harness.close();
    }
  },
);
