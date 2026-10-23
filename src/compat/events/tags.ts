import type { EmitterState, EventMap, EventName, Handler, Listener } from "../../types/events";
import { subscribe, unsubscribeMatching } from "./registry";
import { isCallable } from "../callable";

const MAX_WRAPPER_DEPTH = 3;

/// The emitter layer must never treat a wrapper as a user handler: `ws` keeps
/// `removeListener`/`listeners` disjoint from the `addEventListener` surface.
export const DOM_WRAPPER = Symbol("ventiws.domWrapper");

/// The tags a wrapper carries. They are optional because the registry stores plain
/// listeners and the tag walk reads them back from the same entries.
export type TaggedFields = {
  listener?: unknown;
  attribute?: boolean;
  [DOM_WRAPPER]?: true;
};

/// A callable registry entry plus its optional tags.
export type TaggedHandler<Args extends readonly unknown[]> = Handler<Args> & TaggedFields;

/// The tag walk's input shape. `Function` names the stored handler without fixing its
/// argument tuple, which is what lets a wrapper around any event keep its tags.
export type TaggedFunction = Function & TaggedFields;

/// Tags are only ever attached to functions, so callability is the guard that keeps tag
/// field reads off primitives and null.
export function isTagged(value: unknown): value is TaggedFunction {
  return isCallable(value);
}

function isListener<E extends EventMap, K extends EventName<E>>(
  value: unknown,
): value is Listener<E, K> {
  return isCallable(value);
}

/// The walk is bounded: only the wrapper modules set `listener`, and a user function cannot
/// extend the chain.
export function originalOf(entry: TaggedFunction): TaggedFunction {
  let current = entry;

  for (let depth = 0; depth < MAX_WRAPPER_DEPTH; depth += 1) {
    const next = current.listener;

    if (!isTagged(next)) return current;
    current = next;
  }

  return current;
}

/// True when the entry is the attribute-flavoured DOM wrapper: a user function carrying an
/// `attribute` field must never be mistaken for one.
export function isAttribute(entry: TaggedFunction): boolean {
  return entry[DOM_WRAPPER] === true && entry.attribute === true;
}

/// True when the entry is a DOM wrapper or a `once` wrapper around one.
export function isDomEntry(entry: TaggedFunction): boolean {
  if (entry[DOM_WRAPPER] === true) return true;
  const inner = entry.listener;

  return isTagged(inner) && inner[DOM_WRAPPER] === true;
}

/// The view `listeners()` exposes: `ws` returns its internal DOM wrapper for
/// `addEventListener` registrations and the original handler for `once`.
export function listenerView<E extends EventMap, K extends EventName<E>>(
  entry: TaggedHandler<E[K]>,
): Listener<E, K> {
  const inner = entry.listener;

  if (inner === undefined) return entry;

  if (isDomEntry(entry)) {
    return isTagged(inner) && inner[DOM_WRAPPER] === true && isListener<E, K>(inner)
      ? inner
      : entry;
  }

  return isListener<E, K>(inner) ? inner : entry;
}

/// Removes the most recent entry that matches the handler directly or through
/// its wrapper tags, so `off(event, onceHandler)` works like Node. DOM
/// wrappers are skipped: only `removeEventListener` removes them.
export function removeTagged<E extends EventMap, K extends EventName<E>>(
  state: EmitterState<E>,
  event: K,
  handler: Listener<E, K>,
): void {
  state.listeners = unsubscribeMatching(
    state.listeners,
    event,
    (entry) => entry === handler || (!isDomEntry(entry) && originalOf(entry) === handler),
  );
}

/// Self-removing one-shot wrapper shared by `once`, `prependOnceListener`,
/// and the DOM `once` option. It unsubscribes before invoking so a throwing
/// handler cannot run twice.
export function onceWrapper<E extends EventMap, K extends EventName<E>>(
  state: EmitterState<E>,
  event: K,
  raw: Listener<E, K>,
): TaggedHandler<E[K]> {
  const wrapper = (...args: E[K]): void => {
    state.listeners = unsubscribeMatching(state.listeners, event, (entry) => entry === wrapper);
    raw.call(state.target, ...args);
  };

  return Object.assign(wrapper, { listener: raw });
}

export function onceEvent<E extends EventMap, K extends EventName<E>>(
  state: EmitterState<E>,
  event: K,
  handler: Listener<E, K>,
): void {
  state.listeners = subscribe(state.listeners, event, onceWrapper(state, event, handler));
}
