// What the client puts in frames: byte fidelity for every payload container and the
// mask, including the `generateMask` hook.

import type { Socket } from "node:net";
import { expect, test } from "vitest";
import { WebSocket } from "../../../src/index";
import { TEST_TIMEOUT_MS } from "../../binding/support";
import { openWithPeer, waitFor } from "./client-support";
import { rawAcceptServer } from "./raw-peer";

const CONTAINERS: ReadonlyArray<readonly [string, ArrayBufferView | ArrayBuffer]> = [
  ["a Buffer", Buffer.from([0x61, 0x62, 0x63])],
  ["an ArrayBuffer", new Uint8Array([0x61, 0x62, 0x63]).buffer],
  ["a Uint8Array", new Uint8Array([0x61, 0x62, 0x63])],
  ["a Uint8ClampedArray", new Uint8ClampedArray([0x61, 0x62, 0x63])],
  ["an Int8Array", new Int8Array([-1, 2, -3])],
  ["a Uint16Array", new Uint16Array([0x0161, 0x0162])],
  ["a Uint32Array", new Uint32Array([0x61616161])],
  ["a Float32Array", new Float32Array([1.5, -2.25])],
  ["a Float64Array", new Float64Array([1.5])],
  ["a DataView", new DataView(new Uint8Array([0x61, 0x62]).buffer)],
];

/// `ws` reads a binary container through its byte view, as `Buffer.from` does.
function bytesOf(data: ArrayBufferView | ArrayBuffer): Buffer {
  return ArrayBuffer.isView(data)
    ? Buffer.from(data.buffer, data.byteOffset, data.byteLength)
    : Buffer.from(data);
}

/// The masking key of the first frame a client sends, read off the wire.
async function firstMaskKey(
  peer: { url: string; accepted: Promise<Socket> },
  key?: Buffer,
): Promise<string> {
  const client = new WebSocket(
    peer.url,
    key === undefined ? {} : { generateMask: (mask) => mask.fill(key[0]) },
  );

  try {
    await new Promise<void>((resolve, reject) => {
      client.on("open", resolve);
      client.on("error", reject);
    });
    client.send("hi", () => undefined);
    const frame = await readFrame(await peer.accepted);
    expect(frame.readUInt8(1) & 0x80).toBe(0x80);

    return frame.subarray(2, 6).toString("hex");
  } finally {
    client.terminate();
  }
}

function readFrame(socket: Socket): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let buffered = Buffer.alloc(0);
    const timer = setTimeout(() => reject(new Error("no frame within the timeout")), 5000);

    const onData = (chunk: Buffer): void => {
      buffered = Buffer.concat([buffered, chunk]);

      if (buffered.length < 2) return;
      const short = buffered.readUInt8(1) & 0x7f;
      const extended = short === 126 ? 2 : short === 127 ? 8 : 0;

      if (buffered.length < 2 + extended) return;

      const payload =
        extended === 2
          ? buffered.readUInt16BE(2)
          : extended === 8
            ? Number(buffered.readBigUInt64BE(2))
            : short;

      const total = 2 + extended + 4 + payload;

      if (buffered.length < total) return;
      clearTimeout(timer);
      socket.off("data", onData);
      resolve(buffered.subarray(0, total));
    };

    socket.on("data", onData);
  });
}

test("every binary container keeps its bytes", { timeout: TEST_TIMEOUT_MS }, async () => {
  const received: string[] = [];

  const { socket, harness } = await openWithPeer((peer) => {
    peer.on("message", (data) => received.push(data.toString("hex")));
  });

  try {
    for (const [, data] of CONTAINERS) socket.send(data);
    await waitFor(() => received.length === CONTAINERS.length);
    expect(received).toEqual(CONTAINERS.map(([, data]) => bytesOf(data).toString("hex")));
  } finally {
    socket.terminate();
    await harness.close();
  }
});

test("generateMask supplies the key the frame is masked with", async () => {
  const peer = await rawAcceptServer();

  try {
    expect(await firstMaskKey(peer, Buffer.from([0xa5]))).toBe("a5a5a5a5");
  } finally {
    await peer.close();
  }
});

test("a client without generateMask still masks", async () => {
  const peer = await rawAcceptServer();

  try {
    const key = await firstMaskKey(peer);
    expect(key).toMatch(/^[0-9a-f]{8}$/);
    expect(key).not.toBe("a5a5a5a5");
  } finally {
    await peer.close();
  }
});
