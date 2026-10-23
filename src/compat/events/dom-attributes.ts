import type { SocketState } from "../../types/socket";
import type { WebSocket } from "../../types/ws";
import type { DomEventType, DomListenerCallback } from "./dom-events";
import { addEventListener } from "./dom-listeners";
import { isAttribute, type TaggedFunction } from "./tags";
import { unsubscribeMatching } from "./registry";
import { isCallable } from "../callable";

const ATTRIBUTES: readonly (readonly [string, DomEventType])[] = [
  ["onopen", "open"],
  ["onerror", "error"],
  ["onclose", "close"],
  ["onmessage", "message"],
];

function isDomCallback(value: unknown): value is DomListenerCallback {
  return isCallable(value);
}

export function findAttributeListener(
  state: SocketState,
  type: DomEventType,
): DomListenerCallback | null {
  const bucket: readonly TaggedFunction[] = state.listeners[type] ?? [];

  for (const entry of bucket) {
    if (!isAttribute(entry)) continue;
    const handler = entry.listener;

    return isDomCallback(handler) ? handler : null;
  }

  return null;
}

export function defineDomAttributes(socket: WebSocket, state: SocketState): void {
  for (const [attribute, type] of ATTRIBUTES) {
    Object.defineProperty(socket, attribute, {
      enumerable: true,
      configurable: true,
      get: (): DomListenerCallback | null => findAttributeListener(state, type),
      set: (handler: DomListenerCallback | null): void => {
        state.listeners = unsubscribeMatching(state.listeners, type, (entry) => isAttribute(entry));

        if (!isCallable(handler)) return;
        addEventListener(state, type, handler, { attribute: true });
      },
    });
  }
}
