import {
  codecFailure,
  codecFailureCode,
  type CodecEvent,
  type CodecKindName,
} from "../../binding/codec";
import type { SocketState } from "../../types/socket";
import type { WebSocket } from "../../types/ws";
import { emitEvent } from "../events/emitter";
import { OPEN } from "../ready-state";
import { closeFromPeer } from "./codec-peer-close";
import { failureByCode, refuseByCodec } from "./codec-refusal";
import { writePong } from "./codec-control";
import { binaryPayloadFor } from "./payload-binary";

/// The handle is a parameter, not a second lookup: the `rejected` branch needs the code
/// the codec latched, and a re-lookup could read a different codec.
export function dispatch(
  state: SocketState,
  handle: bigint,
  kind: CodecKindName,
  code: number,
  payload: Buffer,
  ends: readonly number[] | null,
): void {
  switch (kind) {
    case "text":
      // A Buffer, not a string: `ws` converts only for the DOM wrapper.
      emitEvent(state, "message", payload, false);

      return;
    case "binary":
      emitBinary(state, payload, ends);

      return;
    case "ping":
      // RFC 6455 section 5.5.2 wants the pong promptly, so it goes out before the
      // application hears the ping; `ws` writes none once the socket is closing or closed.
      if (state.autoPong && state.readyState === OPEN) writePong(state, payload);
      emitEvent(state, "ping", payload);

      return;
    case "pong":
      emitEvent(state, "pong", payload);

      return;
    case "close":
      closeFromPeer(state, { kind, code, payload });

      return;
    case "rejected":
      // Latched on the codec, not carried in the event: a refused frame ends the
      // connection, so the copy would be a string nobody read.
      refuseByCodec(state, codecFailure(handle) ?? failureByCode(codecFailureCode(handle)));

      return;
  }
}

/// The events a single read can produce more than one of. `open` and `close` are terminal.
export function isDeferrable(event: CodecEvent | null): boolean {
  if (event === null) return false;

  return (
    event.kind === "text" ||
    event.kind === "binary" ||
    event.kind === "ping" ||
    event.kind === "pong"
  );
}

/// A binary message, delivered in the socket's `binaryType`. `blob` is a runtime value
/// `ws` accepts while `@types/ws` omits it from `RawData`, so the assertion restores the
/// caller's own delivery choice for that one case.
function emitBinary(state: SocketState, payload: Buffer, ends: readonly number[] | null): void {
  const delivered = binaryPayloadFor(state.binaryType, payload, ends);
  // SAFETY: `binaryType` is the caller's `ws` value; the vendored `RawData` narrows the
  // three Buffer views and drops the Blob this facade delivers for `"blob"`.
  emitEvent(state, "message", delivered as WebSocket.RawData, true);
}
