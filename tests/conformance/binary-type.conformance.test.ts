// `binaryType` decides what a binary message looks like to a listener. Every value
// `ws` accepts is exercised through a real handshake, and an unknown value is ignored.

import { expect, test } from "vitest";
import type { WebSocket } from "../../src/index";
import type { WebSocket as WsClient } from "ws";
import { TEST_TIMEOUT_MS } from "../binding/support";
import {
  nextSocket,
  openClient,
  upgradeHarness,
  waitFor,
} from "../compat/socket/codec-upgrade-support";

type Open = {
  readonly socket: WebSocket;
  readonly client: WsClient;
  close(): Promise<void>;
};

/// A ventiws socket accepted by a real server, with the `ws` peer that drives it.
async function opened(): Promise<Open> {
  const harness = await upgradeHarness();
  const accepted = nextSocket(harness.server);
  const client = await openClient(harness.url);
  const socket = await accepted;

  return {
    socket,
    client,
    close: async () => {
      client.terminate();
      await harness.close();
    },
  };
}

test("nodebuffer is the default", { timeout: TEST_TIMEOUT_MS }, async () => {
  const { socket, client, close } = await opened();

  try {
    const seen: Array<{ isBuffer: boolean; isArrayBuffer: boolean }> = [];
    socket.on("message", (data) => {
      seen.push({ isBuffer: Buffer.isBuffer(data), isArrayBuffer: data instanceof ArrayBuffer });
    });
    client.send(Buffer.from([1, 2, 3]));
    await waitFor(() => seen.length === 1);
    expect(seen[0]).toEqual({ isBuffer: true, isArrayBuffer: false });
  } finally {
    await close();
  }
});

test("arraybuffer yields exactly the message bytes", { timeout: TEST_TIMEOUT_MS }, async () => {
  const { socket, client, close } = await opened();

  try {
    const seen: ArrayBuffer[] = [];
    socket.on("message", (data) => {
      if (data instanceof ArrayBuffer) seen.push(data);
    });
    socket.binaryType = "arraybuffer";
    client.send(Buffer.from([1, 2, 3]));
    await waitFor(() => seen.length === 1);
    // Three bytes, not the read buffer's allocation.
    expect(seen[0]?.byteLength).toBe(3);
    expect([...new Uint8Array(seen[0])]).toEqual([1, 2, 3]);
  } finally {
    await close();
  }
});

test("blob yields a Blob of exactly the message", { timeout: TEST_TIMEOUT_MS }, async () => {
  const { socket, client, close } = await opened();

  try {
    const seen: Blob[] = [];
    socket.on("message", (data) => {
      if (data instanceof Blob) seen.push(data);
    });
    // SAFETY: `blob` is the runtime value a JavaScript caller sets; the declared
    // union omits it while both implementations accept it.
    socket.binaryType = "blob" as WebSocket["binaryType"];
    client.send(Buffer.from([4, 5, 6]));
    await waitFor(() => seen.length === 1);
    expect(seen[0]?.size).toBe(3);
    expect([...new Uint8Array(await seen[0].arrayBuffer())]).toEqual([4, 5, 6]);
  } finally {
    await close();
  }
});

/// The setting is live, as it is in `ws`.
test("binaryType can change between messages", { timeout: TEST_TIMEOUT_MS }, async () => {
  const { socket, client, close } = await opened();

  try {
    const seen: string[] = [];
    socket.on("message", (data) => {
      seen.push(
        data instanceof ArrayBuffer ? "arraybuffer" : Array.isArray(data) ? "fragments" : "buffer",
      );
    });
    client.send(Buffer.from([1]));
    await waitFor(() => seen.length === 1);
    socket.binaryType = "arraybuffer";
    client.send(Buffer.from([2]));
    await waitFor(() => seen.length === 2);
    socket.binaryType = "fragments";
    client.send(Buffer.from([3]));
    await waitFor(() => seen.length === 3);
    expect(seen).toEqual(["buffer", "arraybuffer", "fragments"]);
  } finally {
    await close();
  }
});

/// An unrecognised value is ignored, as `ws` ignores it.
test("an unknown binaryType is ignored", { timeout: TEST_TIMEOUT_MS }, async () => {
  const { socket, close } = await opened();

  try {
    socket.binaryType = "nodebuffer";
    // SAFETY: `nonsense` is the out-of-type runtime value the case exists to check.
    socket.binaryType = "nonsense" as WebSocket["binaryType"];
    expect(socket.binaryType).toBe("nodebuffer");
  } finally {
    await close();
  }
});
