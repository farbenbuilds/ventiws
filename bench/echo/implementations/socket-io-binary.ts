import type { JsonValue } from "../../support/json-value.ts";

export const ECHO_EVENT = "echo";

/// Engine.IO hands binary attachments through as Buffer in Node, but a JSON packet or a
/// browser-shaped client can deliver any other JSON value or an ArrayBuffer view; anything
/// that is not binary is rejected by the caller rather than coerced.
export type SocketIoPayload = JsonValue | ArrayBuffer | ArrayBufferView;

export const toBinaryBuffer = (payload: SocketIoPayload): Buffer | null => {
  if (Buffer.isBuffer(payload)) return payload;

  if (payload instanceof ArrayBuffer) return Buffer.from(payload);

  if (ArrayBuffer.isView(payload)) {
    return Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength);
  }

  return null;
};
