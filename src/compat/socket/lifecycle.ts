import { logSocketClose, logSocketError } from "../../logging/lifecycle";
import { CLOSE_ABNORMAL } from "../../protocol/close-codes";
import type { SocketState } from "../../types/socket";
import type { WebSocket } from "../../types/ws";
import { emitEvent } from "../events/emitter";
import { CLOSED, CLOSING } from "../ready-state";
import { socketStateOf } from "./state";

const EMPTY = Buffer.alloc(0);

/// Whether the close frame is on the wire: the point `ws` settles `_final` at, which
/// `Sender.close` reaches by ending its socket with the frame and the codec does not.
export function closeFrameWritten(socket: WebSocket): boolean {
  return socketStateOf(socket)?.closeFrameSent === true;
}

export function finishConnection(state: SocketState, code: number, reason: Buffer): void {
  if (state.readyState === CLOSED) return;

  // Dropped because this is the only path to `CLOSED`, and a deadline that outlived its
  // socket would keep the process alive for nothing.
  if (state.closeTimer !== null) {
    clearTimeout(state.closeTimer);
    state.closeTimer = null;
  }

  state.readyState = CLOSED;
  state.closeCode = code;
  state.closeReason = reason;
  // Released on the terminal transition: the parse can never resume and no request is left to cancel.
  state.pendingInput = [];
  state.cancelHandshake = null;
  logSocketClose(state, code, reason);
  emitEvent(state, "close", code, reason);
}

/// Reports a failure and closes, matching `ws`'s `abortHandshake`: it latches `CLOSING`,
/// emits `error`, then `close`, so a listener reading `readyState` during `error` sees
/// `CLOSING` and a second failure produces no second event. A send failure does not come
/// here; see `reportWithoutClosing`.
export function failConnection(state: SocketState, error: Error): void {
  if (state.readyState === CLOSED) return;

  if (!state.errorEmitted) {
    state.errorEmitted = true;
    state.readyState = CLOSING;
    logSocketError(state, error);

    // The terminal latch must run even when an unhandled `error` throws.
    try {
      emitEvent(state, "error", error);
    } finally {
      finishConnection(state, CLOSE_ABNORMAL, EMPTY);
    }

    return;
  }

  finishConnection(state, CLOSE_ABNORMAL, EMPTY);
}

/// Emits `error` once and leaves the socket as it was. A deliberate divergence from
/// `ws`, which is silent for a failed send: the write error reaches the caller's callback
/// and a send with no callback has nothing to observe. It emits, because such a caller
/// would otherwise learn nothing, and it does **not** close, because the condition it
/// reports is a missing implementation rather than a fault of the connection.
export function reportWithoutClosing(state: SocketState, error: Error): void {
  if (state.errorEmitted) return;

  if (state.readyState === CLOSED) return;
  state.errorEmitted = true;
  logSocketError(state, error);
  emitEvent(state, "error", error);
}
