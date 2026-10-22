/// Fields `ws` 8.22.0 reads that `@types/ws` does not declare. The normalizers copy the
/// caller's own enumerable options, so naming the gap on the copy's type is where it is
/// closed; every read site then sees a value the normalizer can validate.

export type UndeclaredClientOptions = {
  readonly protocols?: string | string[];
  readonly closeTimeout?: number;
};

export type UndeclaredServerOptions = {
  readonly closeTimeout?: number;
};
