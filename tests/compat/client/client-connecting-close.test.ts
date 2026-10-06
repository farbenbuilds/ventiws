// `close()` and `terminate()` on a client that is still CONNECTING.
//
// The socket has a request in flight and no transport, so the abort has to reach the
// request. Reporting the failure while leaving the request running opens the door to a
// late 101 that reports an `upgrade` on a socket the caller already closed, and leaves
// the peer with a connection nobody owns.

import { expect, test } from "vitest";
import { WebSocket } from "../../../src/index";
import { TEST_TIMEOUT_MS } from "../../binding/support";
import { delayedAcceptServer } from "./raw-peer";
import { waitFor } from "./client-support";

test.each(["close", "terminate"])(
  "%s while CONNECTING aborts the request and refuses the late 101",
  { timeout: TEST_TIMEOUT_MS },
  async (operation) => {
    const peer = await delayedAcceptServer();
    const socket = new WebSocket(peer.url);
    const events: string[] = [];
    const errors: Error[] = [];
    let code = -1;
    let reason: Buffer = Buffer.from([1]);
    const closed = new Promise<void>((resolve) => {
      socket.on("upgrade", () => events.push("upgrade"));
      socket.on("error", (error) => {
        events.push("error");
        errors.push(error);
      });
      socket.on("close", (closeCode: number, closeReason: Buffer) => {
        code = closeCode;
        reason = closeReason;
        resolve();
      });
    });
    let departed = false;
    void peer.gone.then(() => {
      departed = true;
    });
    try {
      await peer.requestRead;
      if (operation === "close") socket.close();
      else socket.terminate();
      await closed;
      expect(errors.map((error) => error.message)).toEqual([
        "WebSocket was closed before the connection was established",
      ]);
      expect(code).toBe(1006);
      expect(reason).toHaveLength(0);
      expect(socket.readyState).toBe(WebSocket.CLOSED);
      // The request was aborted, so the peer sees the connection go; a request left
      // running would still be there to receive the 101 the fixture writes now.
      peer.accept();
      await waitFor(() => departed || events.includes("upgrade"));
      expect(departed).toBe(true);
      expect(events).toEqual(["error"]);
    } finally {
      await peer.close();
    }
  },
);
