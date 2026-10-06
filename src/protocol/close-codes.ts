import type { ProtocolCloseCode } from "../types/close";

export const CLOSE_NORMAL = 1000 satisfies ProtocolCloseCode;
export const CLOSE_RESERVED = 1004 satisfies ProtocolCloseCode;
export const CLOSE_NO_STATUS = 1005 satisfies ProtocolCloseCode;
export const CLOSE_ABNORMAL = 1006 satisfies ProtocolCloseCode;
export const CLOSE_BAD_GATEWAY = 1014 satisfies ProtocolCloseCode;

export const APPLICATION_CLOSE_MIN = 3000;
export const APPLICATION_CLOSE_MAX = 4999;
export const MAX_CLOSE_REASON_LENGTH = 123;

/// RFC 6455 section 5.5 caps every control frame at 125 bytes. A close frame spends two
/// of them on the code, which is where `MAX_CLOSE_REASON_LENGTH` comes from; a ping or
/// pong spends none.
export const MAX_CONTROL_PAYLOAD_BYTES = 125;

export function isValidControlPayload(payload: string | Buffer): boolean {
  return Buffer.byteLength(payload) <= MAX_CONTROL_PAYLOAD_BYTES;
}

export function isValidStatusCode(code: number): boolean {
  if (code >= APPLICATION_CLOSE_MIN && code <= APPLICATION_CLOSE_MAX) return true;
  return (
    code >= CLOSE_NORMAL &&
    code <= CLOSE_BAD_GATEWAY &&
    code !== CLOSE_RESERVED &&
    code !== CLOSE_NO_STATUS &&
    code !== CLOSE_ABNORMAL
  );
}

export function isApplicationStatusCode(code: number): boolean {
  return Number.isInteger(code) && code >= APPLICATION_CLOSE_MIN && code <= APPLICATION_CLOSE_MAX;
}

export function isReservedStatusCode(code: number): boolean {
  return code === CLOSE_RESERVED || code === CLOSE_NO_STATUS || code === CLOSE_ABNORMAL;
}

export function isValidCloseReason(reason: string | Buffer): boolean {
  return Buffer.byteLength(reason) <= MAX_CLOSE_REASON_LENGTH;
}
