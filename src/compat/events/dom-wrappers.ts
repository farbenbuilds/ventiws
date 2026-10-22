import { isSocket } from "../socket/state";
import { unsubscribeMatching } from "./registry";
import type { Listener } from "../../types/events";
import type { SocketEventMap, SocketState } from "../../types/socket";
import type { WebSocket } from "../../types/ws";
import {
  callListener,
  createCloseEvent,
  createErrorEvent,
  createMessageEvent,
  createOpenEvent,
  type DomEventType,
  type DomListener,
} from "./dom-events";
import type { TaggedFunction, TaggedHandler } from "./tags";

type DomWrapperMap = {
  readonly open: TaggedHandler<SocketEventMap["open"]>;
  readonly message: TaggedHandler<SocketEventMap["message"]>;
  readonly close: TaggedHandler<SocketEventMap["close"]>;
  readonly error: TaggedHandler<SocketEventMap["error"]>;
};

function isWebSocket(value: unknown): value is WebSocket {
  return isSocket(value);
}

/// The DOM surface always belongs to a socket record, which brands itself before any
/// listener can be registered, so a missing target is a broken invariant rather than input.
function socketOf(state: SocketState): WebSocket {
  const target = state.target;

  if (!isWebSocket(target)) {
    throw new TypeError("ventiws: the socket record is missing");
  }

  return target;
}

function tagHandler<K extends DomEventType>(
  wrapper: Listener<SocketEventMap, K>,
  handler: DomListener,
): TaggedHandler<SocketEventMap[K]> {
  return Object.assign(wrapper, { listener: handler });
}

/// The wrapper for each DOM event kind. The runtime `type` selects the entry, so the map is
/// indexed by the narrowed event name rather than branched over inside the dispatcher.
export function wrapperFor<K extends DomEventType>(
  state: SocketState,
  type: K,
  handler: DomListener,
): DomWrapperMap[K] {
  const socket = socketOf(state);

  const wrappers: DomWrapperMap = {
    open: tagHandler<"open">(() => callListener(handler, socket, createOpenEvent(socket)), handler),
    message: tagHandler<"message">((data: WebSocket.RawData, isBinary: boolean): void => {
      callListener(handler, socket, createMessageEvent(socket, isBinary ? data : data.toString()));
    }, handler),
    close: tagHandler<"close">((code: number, reason: Buffer): void => {
      const clean = state.closeFrameReceived && state.closeFrameSent;

      callListener(handler, socket, createCloseEvent(socket, code, reason, clean));
    }, handler),
    error: tagHandler<"error">(
      (error: Error): void => callListener(handler, socket, createErrorEvent(socket, error)),
      handler,
    ),
  };

  return wrappers[type];
}

/// The one-shot wrapper for the DOM `once` option. The wrapper was selected by the runtime
/// event name, so it takes the union listener shape rather than `onceWrapper`'s correlated
/// event parameter.
export function onceDomWrapper(
  state: SocketState,
  type: DomEventType,
  wrapper: TaggedFunction,
): TaggedHandler<SocketEventMap[DomEventType]> {
  const once: Listener<SocketEventMap, DomEventType> = (...args) => {
    state.listeners = unsubscribeMatching(state.listeners, type, (entry) => entry === once);
    wrapper.apply(state.target, args);
  };

  return Object.assign(once, { listener: wrapper });
}
