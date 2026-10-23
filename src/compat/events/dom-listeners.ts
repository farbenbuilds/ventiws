import type { Listener } from "../../types/events";
import type { SocketEventMap, SocketState } from "../../types/socket";
import type { DomEventType, DomListener } from "./dom-events";
import { onceDomWrapper, wrapperFor } from "./dom-wrappers";
import { DOM_WRAPPER, isAttribute, isDomEntry, originalOf } from "./tags";
import { subscribe, unsubscribeMatching } from "./registry";

const DOM_TYPES = ["open", "error", "close", "message"] as const satisfies readonly DomEventType[];

export type DomListenerOptions = {
  readonly once?: boolean;
  readonly attribute?: boolean;
};

function isDomType(type: string): type is DomEventType {
  return DOM_TYPES.some((candidate) => candidate === type);
}

export function addEventListener(
  state: SocketState,
  type: string,
  handler: DomListener,
  options: DomListenerOptions = {},
): void {
  if (!isDomType(type)) return;
  addDomListener(state, type, handler, options);
}

function addDomListener(
  state: SocketState,
  type: DomEventType,
  handler: DomListener,
  options: DomListenerOptions,
): void {
  const attributed = options.attribute === true;
  const bucket = state.listeners[type] ?? [];

  const duplicate = bucket.some(
    (entry) => isDomEntry(entry) && originalOf(entry) === handler && !isAttribute(entry),
  );

  if (!attributed && duplicate) return;
  const wrapper = wrapperFor(state, type, handler);
  wrapper.attribute = attributed;
  wrapper.listener = handler;
  wrapper[DOM_WRAPPER] = true;

  const entry = options.once ? onceDomWrapper(state, type, wrapper) : wrapper;

  // SAFETY: `type` selected the wrapper, so its call signature is this event's argument tuple.
  state.listeners = subscribe(
    state.listeners,
    type,
    entry as Listener<SocketEventMap, DomEventType>,
  );
}

export function removeEventListener(state: SocketState, type: string, handler: DomListener): void {
  if (!isDomType(type)) return;
  state.listeners = unsubscribeMatching(
    state.listeners,
    type,
    (entry) => isDomEntry(entry) && originalOf(entry) === handler && !isAttribute(entry),
  );
}
