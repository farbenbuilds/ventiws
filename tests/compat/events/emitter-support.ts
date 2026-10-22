import { createEmitter } from "../../../src/compat/events/emitter";
import { createRegistry } from "../../../src/compat/events/registry";
import type { EmitterState } from "../../../src/types/events";

export type TestEventMap = {
  open: [];
  message: [value: string, repeat: number];
  error: [error: Error];
};

export type TestTarget = {
  readonly state: EmitterState<TestEventMap>;
  readonly emitter: ReturnType<typeof createEmitter<TestEventMap>>;
  readonly self: object;
};

export function target(): TestTarget {
  const state: EmitterState<TestEventMap> = {
    listeners: createRegistry<TestEventMap>(),
    maxListeners: 10,
    warned: new Set<string>(),
    target: undefined,
  };

  const emitter = createEmitter(state);
  const self = { emitter };
  state.target = self;

  return { state, emitter, self };
}

/// A non-number limit, which Node's `validateNumber` rejects at runtime.
export function setLimitAtRuntime(emitter: TestTarget["emitter"], value: undefined | string): void {
  // SAFETY: Node validates the argument itself, so a non-number is the deliberate fixture;
  // the declaration narrows the parameter to `number`.
  emitter.setMaxListeners(value as never);
}

/// An error event carrying something that is not an `Error`, which `ws` wraps.
export function emitNonError(emitter: TestTarget["emitter"]): void {
  // SAFETY: `"boom"` is the deliberate non-Error payload; the declaration narrows it to `Error`.
  emitter.emit("error", "boom" as never);
}
