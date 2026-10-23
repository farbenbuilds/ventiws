import { isValidStatusCode } from "../../protocol/close-codes";
import { createError } from "../errors";

/// `undefined` is a real answer, not a missing one: `ws` writes an *empty* close payload
/// when `close()` takes no code (`sender.js`), which a peer reads as 1005 (RFC 6455 7.1.5).

/// The code is truncated toward zero, then validated, as in `ws`: `1005.5` passes both
/// validators and truncates to 1005 on the wire, where the peer refuses it. See `COMPATIBILITY.md`.
export function closeCodeOf(code: number | undefined): number | undefined {
  if (code === undefined) return undefined;

  return Math.trunc(assertCloseCode(code));
}

function assertCloseCode(code: number): number {
  // `Number.isFinite` also refuses a non-number a JavaScript caller passes, which the
  // public contract types as a number.
  if (!Number.isFinite(code) || !isValidStatusCode(code)) {
    throw createError(
      "ERR_INVALID_CLOSE_CODE",
      "First argument must be a valid error code number",
      TypeError,
    );
  }

  return code;
}
