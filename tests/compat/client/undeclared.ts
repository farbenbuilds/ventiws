import type { ClientOptions } from "../../../src/index";

/// The client options `ws` accepts at runtime and `@types/ws` does not declare.
///
/// `closeTimeout` is the one this suite drives. Keeping it in one place means a suite is
/// not quietly testing a different value from the one `ws` would get.
export type RuntimeClientOptions = ClientOptions & {
  /// `ws` reads a non-negative number; the normalizer refuses anything else by name.
  readonly closeTimeout?: number | string;
};

export function undeclared(options: RuntimeClientOptions): ClientOptions {
  return options;
}
