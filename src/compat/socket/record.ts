import type { ReadyState } from "../../types/close";
import type { BinaryTypeValue, SocketState } from "../../types/socket";
import type { WebSocket } from "../../types/ws";
import { createEmitter } from "../events/emitter";
import {
  addEventListener,
  removeEventListener,
  type DomListenerOptions,
} from "../events/dom-listeners";
import { defineDomAttributes } from "../events/dom-attributes";
import { CLOSED, CLOSING, CONNECTING, OPEN } from "../ready-state";
import { isBinaryTypeValue, type SocketCallback } from "./argument-kind";
import { closeConnection } from "./close-flow";
import { type CloseReasonInput } from "./close-reason";
import { terminateConnection } from "./transport";
import { pauseConnection, resumeConnection } from "./gating";
import { controlFrame } from "./control";
import { bufferedAmountOf, type SendInput } from "./payload";
import { sendData } from "./send";
import type { SendOptions } from "./send-options";
import { brandSocket } from "./state";

/// The `ws`-shaped socket record, built around a state the caller has filled in. The
/// server path adopts a state and the client path fills one in mid-handshake, so the
/// record is defined once rather than once per direction.
export function buildSocketRecord(state: SocketState): WebSocket {
  const emitter = createEmitter(state);

  const addDomListener = <K extends keyof WebSocket.WebSocketEventMap>(
    type: K,
    listener:
      | ((event: WebSocket.WebSocketEventMap[K]) => void)
      | { handleEvent(event: WebSocket.WebSocketEventMap[K]): void },
    options?: DomListenerOptions,
  ): void => {
    addEventListener(state, type, listener, options);
  };

  const removeDomListener = <K extends keyof WebSocket.WebSocketEventMap>(
    type: K,
    listener:
      | ((event: WebSocket.WebSocketEventMap[K]) => void)
      | { handleEvent(event: WebSocket.WebSocketEventMap[K]): void },
  ): void => {
    removeEventListener(state, type, listener);
  };

  // SAFETY: DOM attributes are defined imperatively below and the emitter registrations
  // return void where the vendored class declares `this`; both are runtime-visible gaps
  // in `@types/ws` rather than a different record shape.
  const socket = {
    CONNECTING,
    OPEN,
    CLOSING,
    CLOSED,
    // Reports the stored value, including "blob": `@types/ws` narrows the public type
    // to three Buffer views, and that narrowing is the vendored contract's.
    get binaryType(): BinaryTypeValue {
      return state.binaryType;
    },
    set binaryType(value: string) {
      // `ws` silently ignores anything else, so this is a narrowing check, not an
      // assertion that could be wrong.
      if (!isBinaryTypeValue(value)) return;

      state.binaryType = value;
    },
    get bufferedAmount(): number {
      // Read live: the number a caller polls to decide whether to stop sending changes
      // as the queue drains, with no send to refresh it. Which queue depends on the
      // route, so the choice lives in one function.
      return bufferedAmountOf(state);
    },
    get extensions(): string {
      return state.extensions;
    },
    get isPaused(): boolean {
      return state.isPaused;
    },
    get protocol(): string {
      return state.protocol;
    },
    get readyState(): ReadyState {
      return state.readyState;
    },
    get url(): string {
      return state.url;
    },
    ...emitter,
    send: (data: SendInput, sendOptions?: SendOptions, callback?: SocketCallback): void => {
      sendData(state, data, sendOptions, callback);
    },
    ping: (data?: SendInput, mask?: boolean | SocketCallback, callback?: SocketCallback): void => {
      controlFrame(state, "ping", data, mask, callback);
    },
    pong: (data?: SendInput, mask?: boolean | SocketCallback, callback?: SocketCallback): void => {
      controlFrame(state, "pong", data, mask, callback);
    },
    close: (code?: number, reason?: CloseReasonInput): void => {
      closeConnection(state, code, reason);
    },
    terminate: (): void => {
      terminateConnection(state);
    },
    pause: (): void => {
      pauseConnection(state);
    },
    resume: (): void => {
      resumeConnection(state);
    },
    addEventListener: addDomListener,
    removeEventListener: removeDomListener,
  } as WebSocket;

  state.target = socket;
  defineDomAttributes(socket, state);
  brandSocket(socket, state);

  return socket;
}
