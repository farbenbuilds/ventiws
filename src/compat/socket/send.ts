/// The `send` entry, and the queue a blob read in flight creates.
///
/// The queue is why this is separate from `send-frame.ts`: `ws` still refuses a bad
/// payload synchronously while another send is pending, and a synchronous throw raised
/// inside the queued work must be routed rather than left as an unhandled rejection.

import type { SocketState } from "../../types/socket";
import { createError } from "../errors";
import { CONNECTING } from "../ready-state";
import { reportWithoutClosing } from "./lifecycle";
import { defer, notOpenError, toPayload } from "./payload";
import { framePayload, frameResolved, resolveCallback } from "./send-frame";
import { isBlob } from "./send-blob";

export function sendData(
  state: SocketState,
  data: unknown,
  options: unknown,
  callback: unknown,
): void {
  if (state.readyState === CONNECTING) throw notOpenError(CONNECTING);
  const pending = state.pendingSend;
  if (pending === null) {
    framePayload(state, data, options, callback);
    return;
  }
  // A blob read in flight has to finish first: `ws` puts the read on its own sender queue,
  // so a send issued after a blob waits behind it and the two arrive in the order called.
  queueSend(state, pending, data, options, callback);
}

function queueSend(
  state: SocketState,
  pending: Promise<void>,
  data: unknown,
  options: unknown,
  callback: unknown,
): void {
  const failure = resolveCallback(options, callback);
  if (isBlob(data)) {
    settle(state, pending, failure, () => framePayload(state, data, options, callback));
    return;
  }
  // Converted before the queue, not inside it: `ws` throws from `send` for a payload
  // `Buffer.from` refuses even while an earlier read is in flight.
  const payload = toPayload(data);
  settle(state, pending, failure, () => frameResolved(state, payload, options, failure));
}

/// Runs one queued send when the read settles. A synchronous throw here would otherwise
/// be an unobserved rejection, so it reaches the callback, or the socket when there is none.
function settle(
  state: SocketState,
  pending: Promise<void>,
  failure: unknown,
  work: () => void,
): void {
  const run = (): void => {
    try {
      work();
    } catch (error) {
      const reported =
        error instanceof Error ? error : createError("ERR_INVALID_STATE", String(error));
      if (typeof failure === "function") defer(failure, reported);
      else reportWithoutClosing(state, reported);
    }
  };
  pending.then(run, run);
}
