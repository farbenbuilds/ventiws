// What a binary message looks like under each `binaryType`.

import { expect, test } from "vitest";
import * as binaryPayload from "../../../src/compat/socket/payload-binary";

test("an exact-sized buffer's ArrayBuffer is handed back, not copied", () => {
  // `ws`'s `toArrayBuffer` returns `buf.buffer` when the view covers it
  // (`buffer-util.js:60-66`), so an exact payload costs no allocation and no copy.
  const payload = Buffer.allocUnsafeSlow(8);
  expect(binaryPayload.binaryPayloadFor("arraybuffer", payload, null)).toBe(payload.buffer);
});

test("a view into a larger allocation is copied to the message's own bytes", () => {
  // A pooled `Buffer` views a shared allocation; handing it over would expose the read.
  const parent = Buffer.allocUnsafeSlow(16);
  const view = parent.subarray(4, 12);
  const bytes = binaryPayload.binaryPayloadFor("arraybuffer", view, null);
  expect(bytes).not.toBe(parent.buffer);
  // SAFETY: the `arraybuffer` arm returns an ArrayBuffer, which the union return hides.
  expect([...new Uint8Array(bytes as ArrayBuffer)]).toEqual([...view]);
});

test("a negative or descending end cannot rewind a fragment", () => {
  const payload = Buffer.from([1, 2, 3, 4]);
  const pieces = binaryPayload.binaryPayloadFor("fragments", payload, [-1, 3, 1]);
  expect(pieces).toEqual([payload.subarray(0, 3), payload.subarray(3)]);
});
