import { closeSocket } from "../../binding/socket";
import { CLOSE_ABNORMAL, CLOSE_NORMAL } from "../../protocol/close-codes";
import type { SocketState } from "../../types/socket";
import { createError } from "../errors";
import { CLOSED, CLOSING, CONNECTING, OPEN } from "../ready-state";
import { closeCodeOf } from "./close-code";
import { toCloseReason, type CloseReasonInput } from "./close-reason";
import { armCloseTimeout, closeFramed } from "./codec-close";
import { closeFailure } from "./close-failure";
import { failConnection, finishConnection, reportWithoutClosing } from "./lifecycle";

const EMPTY = Buffer.alloc(0);

export function closeConnection(
  state: SocketState,
  code?: number,
  reason?: CloseReasonInput,
): void {
  if (state.readyState === CLOSED) return;

  if (state.readyState === CONNECTING) {
    // The in-flight request is the only connection a CONNECTING socket has, so it is
    // cancelled first: a late 101 must not answer a socket that is already CLOSED.
    state.cancelHandshake?.();
    failConnection(
      state,
      createError(
        "ERR_INVALID_STATE",
        "WebSocket was closed before the connection was established",
      ),
    );

    return;
  }

  if (state.readyState === CLOSING) return;
  // Validation precedes the latch: `ws` 8.22.0 refuses an invalid argument before it sets
  // `CLOSING` (#2337), so the socket stays `OPEN` and a following valid close still runs.
  const closeCode = closeCodeOf(code);
  const closeReason = toCloseReason(reason);
  state.readyState = CLOSING;

  // An absent code stays absent to the wire: `ws` writes an empty close payload, which its
  // peer reports as 1005, "no status received", and `closeCode` stays 1006 until a frame
  // supplies one.
  if (state.codec !== null) {
    closeFramed(state, closeCode, closeReason);
    armCloseTimeout(state, state.closeTimeout);

    return;
  }

  if (state.attachment === null) {
    closeUnattached(state);

    return;
  }

  const status = closeSocket(
    state.attachment.server,
    state.attachment.connection,
    // The engine's close always carries a code, so the absent-code rule does not reach
    // it. Unreachable from the public surface today; the clamp gives a real code anyway.
    closeCode ?? CLOSE_NORMAL,
    closeReason,
  );

  if (status === "ok") {
    state.closeFrameSent = true;

    return;
  }

  if (status === "closing" || status === "closed") {
    finishConnection(state, CLOSE_ABNORMAL, EMPTY);

    return;
  }

  if (status === "policy-violation") {
    // The engine route cannot frame an app-initiated close yet; undo the latch and report.
    state.readyState = OPEN;
    reportWithoutClosing(state, closeFailure(status));

    return;
  }

  failConnection(state, closeFailure(status));
}

/// Completes a close on a socket with no native attachment. The latch above has already
/// moved the socket to `CLOSING`, so this path must always reach `CLOSED` on its own:
/// returning early strands it at `CLOSING` for the life of the process, with no close
/// frame, an open transport, and no other door out but the transport's own `close`
/// event. Until the Zig frame codec owns the upgrade route there is no frame to write,
/// so the transport is destroyed and the socket reports `1006`.
function closeUnattached(state: SocketState): void {
  // Cancelled first, so a request in flight stops before `close` reports: otherwise the
  // socket closes while its request is still going to put a connection on the wire.
  state.cancelHandshake?.();

  if (state.transport === null) {
    finishConnection(state, CLOSE_ABNORMAL, EMPTY);

    return;
  }

  state.transport.destroy();
}
