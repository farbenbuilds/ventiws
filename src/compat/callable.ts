/// Callability is a realm-independent property. `ws` accepts a function created in
/// another realm, while `instanceof Function` rejects it; the internal tag does not.
export type Callable = (...args: never[]) => void;

export function isCallable(value: unknown): value is Callable {
  const tag = Object.prototype.toString.call(value);

  return (
    tag === "[object Function]" ||
    tag === "[object AsyncFunction]" ||
    tag === "[object GeneratorFunction]"
  );
}
