/// A sticky one-shot read. The value is kept so a late subscriber still sees an
/// event that already fired, and the callback is kept so an early subscriber
/// still hears one that has not.
export type Once<T> = {
  readonly value: T | null;
  readonly settled: Promise<T>;
  resolve(value: T): void;
};

type OnceState<T> = {
  value: T | null;
  resolve: (value: T) => void;
};

export function once<T>(): Once<T> {
  const state: OnceState<T> = {
    value: null,
    resolve: () => undefined,
  };

  const settled = new Promise<T>((resolve) => {
    state.resolve = resolve;
  });

  return {
    get value(): T | null {
      return state.value;
    },
    settled,
    resolve: (value: T): void => {
      state.value ??= value;
      state.resolve(state.value);
    },
  };
}
