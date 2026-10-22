// What a hostile peer is refused for. Each row is a frame RFC 6455 forbids, the
// close code it maps to, and the event the caller must drain before resuming.

import { expect, test } from "vitest";
import {
  CODEC_KINDS,
  CODEC_ROLE,
  codecFailureCode,
  createCodec,
  destroyCodec,
  feedCodec,
} from "../../src/binding/codec";
import {
  clientCodec,
  clientFrames,
  DEFAULT_MAX_PAYLOAD,
  defaultOptions,
  drain,
  serverCodec,
} from "./codec-support";

const REJECTED = CODEC_KINDS.indexOf("rejected");

type RefusalCase = {
  readonly name: string;
  readonly role: number;
  readonly bytes: Buffer;
  readonly code: number;
};

const REFUSALS: readonly RefusalCase[] = [
  {
    name: "an unmasked frame a server must refuse",
    role: CODEC_ROLE.server,
    bytes: Buffer.from([0x81, 0x02, 0x68, 0x69]),
    code: 1002,
  },
  {
    name: "a masked frame a client must refuse",
    role: CODEC_ROLE.client,
    bytes: clientFrames([{ opcode: 0x1, payload: Buffer.from("masked") }]),
    code: 1002,
  },
  {
    name: "an invalid UTF-8 text payload",
    role: CODEC_ROLE.server,
    bytes: clientFrames([{ opcode: 0x1, payload: Buffer.from([0xc3, 0x28]) }]),
    code: 1007,
  },
  {
    name: "a message over maxPayload",
    role: CODEC_ROLE.server,
    bytes: clientFrames([{ opcode: 0x1, payload: Buffer.alloc(DEFAULT_MAX_PAYLOAD + 1) }]),
    code: 1009,
  },
];

test.each(REFUSALS)("$name is refused with $code", ({ role, bytes, code }) => {
  const handle = createCodec(role, defaultOptions());

  try {
    expect(feedCodec(handle, bytes)).toEqual({ kind: "failed" });
    expect(drain(handle).map((event) => event.kind)).toEqual([CODEC_KINDS[REJECTED]]);
    // The code is latched on the codec, because one refusal ends the whole connection.
    expect(codecFailureCode(handle)).toBe(code);
  } finally {
    destroyCodec(handle);
  }
});

test("maxPayload admits a payload exactly at the limit", () => {
  const handle = serverCodec();

  try {
    const frames = clientFrames([{ opcode: 0x1, payload: Buffer.alloc(DEFAULT_MAX_PAYLOAD) }]);

    expect(feedCodec(handle, frames)).toEqual({ kind: "consumed", bytes: frames.length });
    expect(drain(handle)[0]?.payload.length).toBe(DEFAULT_MAX_PAYLOAD);
  } finally {
    destroyCodec(handle);
  }
});

test("a client accepts the unmasked frame a server refuses", () => {
  const handle = clientCodec();

  try {
    const unmasked = Buffer.from([0x81, 0x02, 0x68, 0x69]);

    expect(feedCodec(handle, unmasked)).toEqual({ kind: "consumed", bytes: unmasked.length });
    expect(drain(handle).map((event) => event.kind)).toEqual([CODEC_KINDS[0]]);
    expect(codecFailureCode(handle)).toBe(0);
  } finally {
    destroyCodec(handle);
  }
});

test("a refusal is reported once and stays reported", () => {
  const handle = serverCodec();

  try {
    expect(feedCodec(handle, Buffer.from([0x81, 0x02, 0x68, 0x69]))).toEqual({ kind: "failed" });
    drain(handle);
    // A refused connection is finished, so later input reports the same reason rather
    // than a fresh, healthy one.
    expect(feedCodec(handle, Buffer.from("hi"))).toEqual({ kind: "failed" });
    expect(codecFailureCode(handle)).toBe(1002);
  } finally {
    destroyCodec(handle);
  }
});
