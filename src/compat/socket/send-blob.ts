/// A `Blob` payload, which has to be read before it can be framed.
///
/// `ws` accepts a `Blob` and its API reference lists one as a valid `send` payload, so a
/// caller bridging browser code reaches this path. The read is asynchronous, which makes
/// this the one send shape that can fail after `send` has returned: the callback is the
/// only place the outcome is reported, exactly as in `ws` (`sender.js:439-478`).

import type { SocketState } from "../../types/socket";
import { OPEN } from "../ready-state";
import { createError } from "../errors";
import { isCallback, isNumberValue, type SocketCallback } from "./argument-kind";
import { isCallable } from "../callable";
import { defer, notOpenError } from "./payload";
import { framePayload } from "./send-frame";
import type { SendOptions } from "./send-options";

/// The minimum shape of a `Blob` this accepts, checked structurally because a global
/// `Blob` is absent on a Node build without it and a cross-realm one is not `instanceof`.
type BlobLike = {
  readonly size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
};

export function isBlob(value: unknown): value is BlobLike {
  if (value === null || value === undefined || isCallable(value)) return false;
  const candidate = Object(value);

  return isCallback(candidate.arrayBuffer) && isNumberValue(candidate.size);
}

/// Reads the blob and sends its bytes. The options are passed through untouched so
/// `binary`, `compress`, `fin` and `mask` still mean what the caller said, except that a
/// blob is always binary: `ws` reads one as a buffer and never as text.
export function sendBlob(
  state: SocketState,
  blob: BlobLike,
  options: SendOptions | undefined,
  callback: SocketCallback | undefined,
): void {
  if (state.readyState !== OPEN) {
    state.bufferedExtra += blob.size;
    defer(callback, notOpenError(state.readyState));

    return;
  }

  const reading = blob
    .arrayBuffer()
    .then((buffer) => {
      if (state.readyState !== OPEN) {
        state.bufferedExtra += buffer.byteLength;
        defer(callback, notOpenError(state.readyState));

        return;
      }

      // `framePayload`, not `sendData`: the latter queues behind this same read.
      framePayload(state, Buffer.from(buffer), { ...options, binary: true }, callback);
    })
    .catch((error) => {
      defer(
        callback,
        error instanceof Error ? error : createError("ERR_INVALID_OPTION", String(error)),
      );
    })
    .finally(() => {
      if (state.pendingSend === reading) state.pendingSend = null;
    });

  state.pendingSend = reading;
}
