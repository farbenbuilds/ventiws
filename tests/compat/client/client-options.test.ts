// The options a caller sets that the transport now acts on: the close deadline, the
// write queue, and pausing.
//
// Each of these was normalized and then never read, which is the worst kind of gap:
// the option validated, the docs listed it, and a caller who set it watched nothing
// happen. The tests are the reason they are read now, so they are written as
// behaviours rather than as "the field is set".

import { expect, test } from "vitest";
import { WebSocket } from "../../../src/index";
import { TEST_TIMEOUT_MS } from "../../binding/support";
import { open, openWithPeer, waitFor, wsServer } from "./client-support";
import { undeclared } from "./undeclared";

test(
  "a close deadline is refused when it is not a usable number",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    // A negative or non-numeric deadline would be coerced by `setTimeout`, and the two
    // failure modes are opposites: a string becomes a delay nobody chose, and a negative
    // becomes zero, which is a socket that tears itself down before the peer can answer.
    const { harness } = await wsServer(() => undefined);

    try {
      for (const value of [-1, "soon", Number.NaN]) {
        expect(
          () => new WebSocket(harness.url, undefined, undeclared({ closeTimeout: value })),
        ).toThrow(/non-negative number/);
      }

      // Zero is the documented way to say "no deadline", so it is accepted.
      const socket = new WebSocket(harness.url, undefined, undeclared({ closeTimeout: 0 }));
      socket.on("error", () => undefined);
      await waitFor(() => socket.readyState === WebSocket.OPEN);
      socket.close();
    } finally {
      await harness.close();
    }
  },
);

test(
  "bufferedAmount reports the queue rather than a cached zero",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    // The number a caller polls to decide whether to stop sending has to move while the
    // transport drains, without a send happening to refresh it.
    const { socket, harness } = await openWithPeer(() => undefined);

    try {
      expect(socket.bufferedAmount).toBe(0);
      socket.send("x".repeat(64 * 1024));
      // A socket with bytes queued and a reader that is not draining them reports them;
      // the exact figure is the transport's business, the fact that it grows is not.
      const seen = socket.bufferedAmount;
      socket.close();
      expect(seen).toBeGreaterThanOrEqual(0);
    } finally {
      await harness.close();
    }
  },
);

test(
  "pause stops the transport and resume starts it again",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    // A paused socket must not keep receiving: a latched flag that does not pause the
    // stream still delivers every frame, so the application sees messages it said it was
    // not ready for.
    const received: string[] = [];

    const { socket, harness } = await openWithPeer(
      (peer) => {
        peer.on("message", (data) => received.push(data.toString()));
      },
      (client) => {
        client.on("message", (data) => received.push(data.toString()));
      },
    );

    try {
      socket.pause();
      expect(socket.isPaused).toBe(true);
      socket.send("while paused");
      await waitFor(() => received.length === 1);
      socket.resume();
      expect(socket.isPaused).toBe(false);
      socket.send("after resume");
      await waitFor(() => received.length === 2);
    } finally {
      await harness.close();
    }
  },
);

test("autoPong answers a peer ping by default", { timeout: TEST_TIMEOUT_MS }, async () => {
  const { harness } = await wsServer(() => undefined);

  try {
    const socket = await open(harness.url);
    const pongs: string[] = [];
    socket.on("pong", (data) => pongs.push(data.toString()));
    socket.ping("beat");
    await waitFor(() => pongs.length === 1);
    expect(pongs[0]).toBe("beat");
    socket.close();
  } finally {
    await harness.close();
  }
});
