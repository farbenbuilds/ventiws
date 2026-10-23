// The client close handshake: both directions, the deadline for a peer that never
// answers, and the validation order that leaves a refused call from changing state.

import { expect, test } from "vitest";
import { WebSocket } from "../../../src/index";
import { TEST_TIMEOUT_MS } from "../../binding/support";
import { open, openWithPeer, waitFor, wsServer } from "./client-support";
import { rawAcceptServer } from "./raw-peer";
import { undeclared } from "./undeclared";

test("a close from the client completes the handshake", { timeout: TEST_TIMEOUT_MS }, async () => {
  const peerCodes: number[] = [];

  const { socket, harness } = await openWithPeer((peer) => {
    peer.on("close", (code: number) => peerCodes.push(code));
  });

  const closed = new Promise<[number, string]>((resolve) => {
    socket.on("close", (code, reason) => resolve([code, reason.toString()]));
  });

  try {
    socket.close(1000, "bye");
    expect(await closed).toEqual([1000, "bye"]);
    await waitFor(() => peerCodes.length === 1);
    expect(peerCodes[0]).toBe(1000);
  } finally {
    await harness.close();
  }
});

test(
  "a close from the server is answered by the client",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const { harness } = await wsServer((peer) => {
      peer.close(1001, "going away");
    });

    const order: string[] = [];

    const closed = new Promise<[number, string]>((resolve) => {
      void open(harness.url, (client) => {
        client.on("open", () => order.push("open"));
        client.on("close", (code, reason) => {
          order.push("close");
          resolve([code, reason.toString()]);
        });
      });
    });

    try {
      expect(await closed).toEqual([1001, "going away"]);
      expect(order).toEqual(["open", "close"]);
    } finally {
      await harness.close();
    }
  },
);

test(
  "a peer that never answers is torn down at the deadline",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const peer = await rawAcceptServer();

    try {
      const socket = await open(peer.url, undefined, undefined, undeclared({ closeTimeout: 150 }));
      const closed = new Promise<number>((resolve) => socket.on("close", resolve));
      socket.close(1000, "bye");
      expect(socket.readyState).toBe(WebSocket.CLOSING);
      expect(await closed).toBe(1006);
      expect(socket.readyState).toBe(WebSocket.CLOSED);
    } finally {
      await peer.close();
    }
  },
);

test(
  "a peer that answers reports the code and reason it was sent",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const { socket, harness } = await openWithPeer(
      () => undefined,
      undefined,
      undefined,
      undeclared({ closeTimeout: 5_000 }),
    );

    const closed = new Promise<[number, string]>((resolve) => {
      socket.on("close", (code, reason) => resolve([code, reason.toString()]));
    });

    try {
      socket.close(1000, "bye");
      expect(await closed).toEqual([1000, "bye"]);
    } finally {
      await harness.close();
    }
  },
);

/// `ws` 8.22.0 refuses an invalid argument before latching CLOSING, so a following
/// valid close still runs.
test(
  "a refused close leaves the socket OPEN and a valid close still runs",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const { socket, harness } = await openWithPeer(() => undefined);

    const closed = new Promise<[number, string]>((resolve) => {
      socket.on("close", (code, reason) => resolve([code, reason.toString()]));
    });

    try {
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
