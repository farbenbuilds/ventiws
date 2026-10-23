import type { SocketState } from "../../types/socket";
import { writeFrame } from "./codec-outbound";

/// A pong is not optional: RFC 6455 section 5.5.2 requires one, promptly.
export function writePong(state: SocketState, payload: Buffer): void {
  writeFrame(state, "pong", payload);
}

/// An absent `code` writes the *empty* close payload, which is what a peer reads as "no
/// status"; substituting 1000 would claim a shutdown the caller never stated.
export function writeCloseFrame(
  state: SocketState,
  code: number | undefined,
  reason: Buffer,
): void {
  if (state.closeFrameSent) return;
  const frame = closePayload(code, reason);

  if (writeFrame(state, "close", frame) !== "ok") return;
  state.closeFrameSent = true;
}

function closePayload(code: number | undefined, reason: Buffer): Buffer {
  if (code === undefined) return Buffer.alloc(0);
  const payload = Buffer.alloc(2 + reason.length);
  payload.writeUInt16BE(code, 0);
  reason.copy(payload, 2);

  return payload;
}
