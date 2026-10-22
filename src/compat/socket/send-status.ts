import type { SocketState } from "../../types/socket";
import type { EngineStatus } from "../../types/status";
import { createError } from "../errors";
import type { SocketCallback } from "./argument-kind";
import { defer, notOpenError, statusError } from "./payload";
import { reportFailure } from "./send-failure";

/// Reports what staging one message did. The `ok` and `sendAfterClose` branches defer, as
/// `ws` does; a status the engine cannot produce is a compile-time `never` rather than a
/// silent no-op.
export function applySendStatus(
  state: SocketState,
  status: EngineStatus,
  callback: SocketCallback | undefined,
): void {
  switch (status) {
    case "ok":
      defer(callback);

      return;
    case "backpressure":
      reportFailure(
        state,
        callback,
        createError("ERR_BACKPRESSURE", "ventiws: the outbound staging ring is full"),
      );

      return;
    case "closing":
    case "closed":
      // The engine says the connection is gone, so this is `sendAfterClose`.
      defer(callback, notOpenError(state.readyState));

      return;
    case "invalid-handle":
      reportFailure(
        state,
        callback,
        createError("ERR_INVALID_HANDLE", "ventiws: the connection handle is stale"),
      );

      return;
    case "payload-too-large":
    case "invalid-close-code":
    case "invalid-close-reason":
    case "protocol-error":
    case "policy-violation":
      reportFailure(state, callback, statusError(status));

      return;
  }

  throw unhandledStatus(status);
}

function unhandledStatus(status: never): Error {
  return createError(
    "ERR_INVALID_STATE",
    `ventiws: the engine reported an unknown socket status "${String(status)}"`,
  );
}
