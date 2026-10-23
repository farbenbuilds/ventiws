import { expect } from "vitest";
import {
  CODEC_ROLE,
  createCodec,
  selectCodecEvent,
  selectedCodecEvent,
  takeCodecEvent,
  type CodecEvent,
  type CodecOptions,
} from "../../src/binding/codec";

/// Two fixed header bytes plus the four-byte mask key, named so a decode-stop says 6.
export const MASKED_HEADER_BYTES = 6;

/// The `maxPayload` shared by these suites: the compiled codec base, not the 4 GiB
/// `maxPayloadBytes` ceiling, which no case here needs to allocate.
export const DEFAULT_MAX_PAYLOAD = 64 * 1024;

const DEFAULT_MAX_FRAGMENTS = 16 * 1024;
const MASK: readonly number[] = [0x37, 0xfa, 0x21, 0x3d];

export type ClientFrame = {
  readonly opcode: number;
  readonly payload: Buffer;
  readonly fin?: boolean;
};

export function defaultOptions(overrides: Partial<CodecOptions> = {}): CodecOptions {
  return {
    maxPayload: DEFAULT_MAX_PAYLOAD,
    maxFragments: DEFAULT_MAX_FRAGMENTS,
    validateUtf8: true,
    permessageDeflate: false,
    ...overrides,
  };
}

export function serverCodec(overrides: Partial<CodecOptions> = {}): bigint {
  return createCodec(CODEC_ROLE.server, defaultOptions(overrides));
}

export function clientCodec(overrides: Partial<CodecOptions> = {}): bigint {
  return createCodec(CODEC_ROLE.client, defaultOptions(overrides));
}

/// A client frame is built here rather than by the codec's own encoder, so a decoder
/// that is wrong in a symmetric way still fails.
export function clientFrame(frame: ClientFrame): Buffer {
  const length = frame.payload.length;
  const wide = length > 0xffff;
  const extended = length > 125;
  const extra = wide ? 8 : extended ? 2 : 0;
  const header = Buffer.alloc(2 + extra + 4);
  header[0] = (frame.fin === false ? 0x00 : 0x80) | frame.opcode;

  if (wide) {
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  } else if (extended) {
    header[1] = 0x80 | 126;
    header.writeUInt16BE(length, 2);
  } else {
    header[1] = 0x80 | length;
  }

  header.set(MASK, 2 + extra);
  const body = Buffer.from(frame.payload);

  for (let index = 0; index < body.length; index += 1) {
    body[index] = body[index] ^ MASK[index & 3];
  }

  return Buffer.concat([header, body]);
}

export function clientFrames(frames: readonly ClientFrame[]): Buffer {
  return Buffer.concat(frames.map(clientFrame));
}

export function closePayload(code: number, reason: string): Buffer {
  const body = Buffer.from(reason, "utf8");
  const payload = Buffer.alloc(2 + body.length);
  payload.writeUInt16BE(code, 0);
  body.copy(payload, 2);

  return payload;
}

/// The queue is a control ring plus one message slot, so a fixed event count per feed
/// either leaves events behind or reads a slot that is not there yet.
export function drain(handle: bigint): CodecEvent[] {
  const events: CodecEvent[] = [];

  while (selectCodecEvent(handle)) {
    const event = selectedCodecEvent(handle);

    expect(event).not.toBeNull();

    if (event === null) break;
    events.push(event);
    takeCodecEvent(handle);
  }

  return events;
}
