import type {
  CloseEvent,
  ErrorEvent,
  Event as SocketEvent,
  MessageEvent,
  WebSocket,
} from "../../types/ws";
import { isCallable } from "../callable";

export function createOpenEvent(target: WebSocket): SocketEvent {
  return { type: "open", target };
}

export function createMessageEvent(target: WebSocket, data: WebSocket.Data): MessageEvent {
  return { type: "message", target, data };
}

export function createCloseEvent(
  target: WebSocket,
  code: number,
  reason: Buffer,
  wasClean: boolean,
): CloseEvent {
  return { type: "close", target, code, reason: reason.toString(), wasClean };
}

export function createErrorEvent(target: WebSocket, error: Error): ErrorEvent {
  return { type: "error", target, error, message: error.message };
}

export type DomEventType = "open" | "error" | "close" | "message";

/// A DOM callback is written against one event kind, so it is bivariant: a message listener
/// must reach a dispatch typed for the whole event family.
export type DomListenerCallback = {
  bivarianceHack(event: SocketEvent): void;
}["bivarianceHack"];

export type DomListenerObject = {
  handleEvent(event: SocketEvent): void;
};

export type DomListener = DomListenerCallback | DomListenerObject;

/// An object listener is handed to its `handleEvent` method, matching whatwg semantics. A
/// JavaScript caller can still put anything here, so the shape is checked before the call.
export function callListener(handler: DomListener, target: WebSocket, event: SocketEvent): void {
  if (isCallable(handler)) {
    handler.call(target, event);

    return;
  }

  if (!isCallable(handler?.handleEvent)) {
    throw new TypeError("EventListener must be a function or an object with a handleEvent method");
  }

  handler.handleEvent(event);
}
