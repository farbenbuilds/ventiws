import { MAX_CLOSE_REASON_LENGTH } from "../../protocol/close-codes";
import { createError } from "../errors";
import { isStringValue } from "./argument-kind";

const EMPTY = Buffer.alloc(0);

/// The reach of the measurement, not a promise the argument is acceptable. The optional
/// `length` is `ws`'s probe: a value without a positive one is "no reason data".
type MeasuredReason = (string | NodeJS.ArrayBufferView | ArrayBufferLike) & {
  readonly length?: number;
};

export type CloseReasonInput = MeasuredReason | null | undefined;

/// `ws`'s sender-argument order: data, measure, cap, then dispatch on type. Type first inverted
/// the failures: a `Float32Array` of 50 is 200 bytes, so `ws` reports a `RangeError`, not a `TypeError`.

// The `Uint8Array` guard fixes GHSA-58qx-3vcg-4xpx: a differently typed array reports fewer
// elements than its `byteLength`, so a frame sized from `byteLength` would ship unwritten heap
// bytes. Two deliberate divergences: `null` is an absent reason, and the probe is not try/caught.
export function toCloseReason(reason: CloseReasonInput): Buffer {
  if (reason === undefined) return EMPTY;

  if (reason === null) return EMPTY;

  if (!hasReasonData(reason)) return EMPTY;
  assertReasonLength(Buffer.byteLength(reason));

  if (isStringValue(reason)) return Buffer.from(reason, "utf8");

  if (reason instanceof Uint8Array) return Buffer.from(reason);
  throw createError(
    "ERR_INVALID_OPTION",
    "Second argument must be a string or a Uint8Array",
    TypeError,
  );
}

/// `ws`'s unguarded `!data.length` probe: only a nonzero numeric `length` counts.
function hasReasonData(reason: MeasuredReason): boolean {
  const length = reason.length;

  return length !== undefined && Number.isFinite(length) && length > 0;
}

function assertReasonLength(length: number): void {
  if (length <= MAX_CLOSE_REASON_LENGTH) return;
  throw createError(
    "ERR_INVALID_CLOSE_REASON",
    "The message must not be greater than 123 bytes",
    RangeError,
  );
}
