// What a binary message looks like under each `binaryType`.

import { expect, test } from "vitest";
import { shapeBinary } from "../../../src/compat/socket/payload-shape";

test("an exact-sized buffer's ArrayBuffer is handed back, not copied", () => {
  // `ws`'s `toArrayBuffer` returns `buf.buffer` when the view covers it
  // (`buffer-util.js:60-66`); the identity is the point: no allocation and no memcpy for
  // a payload that already owns its allocation.
  const payload = Buffer.allocUnsafeSlow(8);
  expect(shapeBinary("arraybuffer", payload, null)).toBe(payload.buffer);
});

test("a view into a larger allocation is copied to the message's own bytes", () => {
  // A pooled `Buffer` is a view into a shared 8 KiB allocation, and handing that whole
  // allocation over would expose whatever else the kernel delivered in the same read.
  const parent = Buffer.allocUnsafeSlow(16);
  const view = parent.subarray(4, 12);
  const shaped = shapeBinary("arraybuffer", view, null);
  expect(shaped).not.toBe(parent.buffer);
  expect([...new Uint8Array(shaped as ArrayBuffer)]).toEqual([...view]);
});

test("a negative or descending end cannot rewind a fragment", () => {
  const payload = Buffer.from([1, 2, 3, 4]);
  const pieces = shapeBinary("fragments", payload, [-1, 3, 1]);
  expect(pieces).toEqual([payload.subarray(0, 3), payload.subarray(3)]);
});
