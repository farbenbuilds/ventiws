// What a peer sends is decoded into events, and what this side sends is a frame the
// other role accepts. Expected frames are built from RFC 6455, not from the encoder.

import { afterEach, expect, test } from "vitest";
import {
  CODEC_KINDS,
  codecFeedResume,
  codecOutbound,
  codecOutboundMasked,
  destroyCodec,
  encodeCodecFrame,
  feedCodec,
  pendingCodecEvents,
} from "../../src/binding/codec";
import {
  clientCodec,
  clientFrames,
  closePayload,
  drain,
  MASKED_HEADER_BYTES,
  serverCodec,
} from "./codec-support";

const TEXT = CODEC_KINDS.indexOf("text");
const openHandles: bigint[] = [];

/// Keeps teardown out of every test body while still releasing a codec after a failure.
function tracked(handle: bigint): bigint {
  openHandles.push(handle);

  return handle;
}

afterEach(() => {
  for (const handle of openHandles.splice(0)) destroyCodec(handle);
});

test("masked frames decode to the events a server owes a peer", () => {
  const handle = tracked(serverCodec());
  const ping = clientFrames([{ opcode: 0x9, payload: Buffer.from("beat") }]);
  const binary = clientFrames([{ opcode: 0x2, payload: Buffer.from([0, 1, 2, 255]) }]);
  const close = clientFrames([{ opcode: 0x8, payload: closePayload(1000, "bye") }]);
  const fed = feedCodec(handle, Buffer.concat([ping, binary, close]));

  expect(fed).toEqual({
    kind: "consumed",
    bytes: ping.length + binary.length + close.length,
  });
  const events = drain(handle);

  // A control frame overtakes queued data, but `close` is terminal and does not
  // overtake: delivering it first would drop the message the peer sent before it.
  expect(events.map((event) => event.kind)).toEqual(["ping", "binary", "close"]);
  expect(events[0]?.payload.toString()).toBe("beat");
  expect(events[1] === undefined ? [] : [...events[1].payload]).toEqual([0, 1, 2, 255]);
  expect(events[2]?.code).toBe(1000);
  expect(events[2]?.payload.toString()).toBe("bye");
});

test("a fragmented message split across reads decodes on its last byte", () => {
  const handle = tracked(serverCodec());

  const frames = clientFrames([
    { opcode: 0x1, payload: Buffer.from("frag"), fin: false },
    { opcode: 0x0, payload: Buffer.from("mented") },
  ]);

  for (let index = 0; index < frames.length; index += 1) {
    expect(feedCodec(handle, frames.subarray(index, index + 1))).toEqual({
      kind: "consumed",
      bytes: 1,
    });
  }

  expect(drain(handle).map((event) => event.payload.toString())).toEqual(["fragmented"]);
});

test("decoding copies the caller's buffer instead of unmasking in place", () => {
  const handle = tracked(serverCodec());
  const masked = clientFrames([{ opcode: 0x1, payload: Buffer.from("secret") }]);
  const before = Buffer.from(masked);

  expect(feedCodec(handle, masked)).toEqual({ kind: "consumed", bytes: masked.length });
  expect(masked.equals(before)).toBe(true);
  expect(drain(handle)[0]?.payload.toString()).toBe("secret");
});

test("every queued control event keeps its own payload", () => {
  const handle = tracked(serverCodec());
  const payloads = ["one", "two", "three", "four"];

  const frames = clientFrames(
    payloads.map((payload) => ({ opcode: 0x9, payload: Buffer.from(payload) })),
  );

  expect(feedCodec(handle, frames)).toEqual({ kind: "consumed", bytes: frames.length });
  expect(pendingCodecEvents(handle)).toBe(payloads.length);
  expect(drain(handle).map((event) => event.payload.toString())).toEqual(payloads);
});

test("one data message waits at a time, and the offset resumes it", () => {
  const handle = tracked(serverCodec());
  const first = clientFrames([{ opcode: 0x1, payload: Buffer.from("one") }]);
  const second = clientFrames([{ opcode: 0x1, payload: Buffer.from("two") }]);
  const together = Buffer.concat([first, second]);

  // A queued payload points into the single reassembly buffer, so a second one
  // would overwrite the first and the caller would read one message as another.
  expect(feedCodec(handle, together)).toEqual({ kind: "backpressure" });
  // The second frame's header was taken before the queue was found full, so the
  // offset is the end of that header rather than the start of the frame.
  expect(codecFeedResume(handle)).toBe(first.length + MASKED_HEADER_BYTES);
  expect(pendingCodecEvents(handle)).toBe(1);
  expect(drain(handle).map((event) => event.payload.toString())).toEqual(["one"]);

  const rest = together.subarray(codecFeedResume(handle));

  expect(feedCodec(handle, rest)).toEqual({
    kind: "consumed",
    bytes: second.length - MASKED_HEADER_BYTES,
  });
  expect(drain(handle).map((event) => event.payload.toString())).toEqual(["two"]);
});

test("a server frame round-trips into a client codec and back", () => {
  const server = tracked(serverCodec());
  const client = tracked(clientCodec());
  const length = encodeCodecFrame(server, TEXT, true, Buffer.from("out"), false, false);
  const outbound = codecOutbound(server).subarray(0, length);

  expect(outbound.at(0)).toBe(0x81);
  expect(codecOutboundMasked(server)).toBe(false);
  expect(feedCodec(client, outbound)).toEqual({ kind: "consumed", bytes: length });
  expect(drain(client).map((event) => [event.kind, event.payload.toString()])).toEqual([
    ["text", "out"],
  ]);

  const maskedLength = encodeCodecFrame(client, TEXT, true, Buffer.from("back"), false);
  const masked = codecOutbound(client).subarray(0, maskedLength);

  expect(codecOutboundMasked(client)).toBe(true);
  expect((masked.at(1) ?? 0) & 0x80).toBe(0x80);
  expect(feedCodec(server, masked)).toEqual({ kind: "consumed", bytes: maskedLength });
  expect(drain(server).map((event) => [event.kind, event.payload.toString()])).toEqual([
    ["text", "back"],
  ]);
});
