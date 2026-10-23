// Client frames built from RFC 6455 rather than from the codec's own encoder, so a
// decoder that is wrong symmetrically still fails.

export type ClientFrame = {
  readonly opcode: number;
  readonly payload: Buffer;
  readonly fin?: boolean;
};

const MASK: readonly number[] = [0x37, 0xfa, 0x21, 0x3d];

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

/// A close frame payload: two big-endian code bytes and a UTF-8 reason.
export function closePayload(code: number, reason: string): Buffer {
  const body = Buffer.from(reason, "utf8");
  const payload = Buffer.alloc(2 + body.length);
  payload.writeUInt16BE(code, 0);
  body.copy(payload, 2);

  return payload;
}
