import type { CodecFailureName } from "../../binding/codec";
import type { SocketState } from "../../types/socket";
import { refuseFramed } from "./codec-close";
import { REFUSALS, type Refusal } from "./refusal-table";

/// The fall-through is the protocol error, not a throw: this runs on the message path
/// where the codec has already latched a refusal, and a throw would cost an exception for
/// every frame a hostile peer chooses to send.
function refusalOf(failure: CodecFailureName): Refusal {
  return REFUSALS[failure] ?? REFUSALS.protocolError;
}

/// The code is a coarser thing than the name: twelve faults close with a 1002. This is
/// `ws`'s shape of that gap, and callers fall back here only when the handle went stale.
export function failureByCode(code: number): CodecFailureName {
  switch (code) {
    case 1007:
      return "invalidUtf8";
    case 1008:
      return "tooManyBufferedParts";
    case 1009:
      return "unsupportedMessageLength";
    default:
      return "protocolError";
  }
}

/// The failure name is the reason the application gets and the close code the reason the
/// peer gets, decided together in one table so they cannot disagree.
export function refuseByCodec(state: SocketState, failure: CodecFailureName): void {
  refuseFramed(state, refusalOf(failure));
}
