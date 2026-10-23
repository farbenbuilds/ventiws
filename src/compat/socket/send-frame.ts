/// Framing and staging one message whose payload is already resolved.
///
/// Split from `send.ts`, which owns the queue a blob read creates: this half never waits,
/// so the synchronous throw a bad payload still owes the caller belongs there.

import { sendSocket } from "../../binding/socket";
import type { SocketState } from "../../types/socket";
import { OPEN } from "../ready-state";
import { isCallback, type SocketCallback } from "./argument-kind";
import { sendFramed } from "./codec-send";
import { reportWithoutClosing } from "./lifecycle";
import { notAttachedError } from "./send-failure";
import { defer, notOpenError, toPayload, type SocketPayload } from "./payload";
import { isBlob, sendBlob } from "./send-blob";
import { booleanOption, sendOptionsFrom, type SendOptions } from "./send-options";
import { applySendStatus } from "./send-status";

/// Frames and stages one message. Exported, and not reached through `sendData` by the blob
/// path: `sendData` queues behind the very read that is asking it to run, so a blob would
/// wait on itself for ever. See `send-blob.ts`.
export function framePayload<Data, Options, Callback>(
  state: SocketState,
  data: Data,
  options: Options,
  callback: Callback,
): void {
  const failure = resolveCallback(options, callback);
  const sendOptions = sendOptionsFrom(options);

  // A blob is read before it is framed, so it leaves through its own path; the callback is
  // the only report, which is what `ws` does with one too.
  if (isBlob(data)) {
    sendBlob(state, data, sendOptions, failure);

    return;
  }

  frameResolved(state, toPayload(data), sendOptions, failure);
}

/// Frames a payload that is already bytes; the queued non-blob path converts before it
/// queues, so this is only reached once `send`'s synchronous validation has happened.
export function frameResolved(
  state: SocketState,
  payload: SocketPayload,
  options: SendOptions | undefined,
  failure: SocketCallback | undefined,
): void {
  if (state.readyState !== OPEN) {
    // `sendAfterClose`: the bytes are accounted and the callback is told, nothing
    // else. Routing this through `reportFailure` would close a merely mid-close socket.
    state.bufferedExtra += payload.bytes.length;
    defer(failure, notOpenError(state.readyState));

    return;
  }

  if (state.codec !== null) {
    // The codec frames for a socket that has a transport, so a message goes out as a
    // frame rather than as bytes the engine would have to frame.
    sendFramed(state, payload, options, failure);

    return;
  }

  if (state.attachment === null) {
    // Not `reportFailure`: the failure is this build's missing transport, not the
    // socket's, so only the observation differs from `ws`.
    if (failure !== undefined) defer(failure, notAttachedError());
    else reportWithoutClosing(state, notAttachedError());

    return;
  }

  const binary = sendBinary(options, payload.binary);

  const status = sendSocket(
    state.attachment.server,
    state.attachment.connection,
    payload.bytes,
    binary,
  );

  applySendStatus(state, status, failure);
}

/// `ws` treats a function in the options position as the callback.
export function resolveCallback<Options, Callback>(
  options: Options,
  callback: Callback,
): SocketCallback | undefined {
  if (isCallback(options)) return options;

  if (isCallback(callback)) return callback;

  return undefined;
}

function sendBinary(options: SendOptions | undefined, fallback: boolean): boolean {
  if (options === undefined) return fallback;

  return booleanOption(options.binary, fallback);
}
