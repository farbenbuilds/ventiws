import type { ServerOptions as WsServerOptions } from "ws";
import type { ServerOptions } from "../../src/index";

/// The two option records, which differ only in the constructor type their defaults name.
type AnyServerOptions = ServerOptions | WsServerOptions;

/// The server options `ws` accepts at runtime and `@types/ws` does not declare; typing the
/// intersection here keeps each fixture named rather than cast.
export type RuntimeServerOptions = ServerOptions & {
  /// `ws` reads a non-negative number; the normalizer refuses anything else by name.
  readonly closeTimeout?: number;
};

/// The public option record as a map, so a key `@types/ws` omits is still readable uncast.
export function optionValues(options: AnyServerOptions): ReadonlyMap<string, unknown> {
  return new Map(Object.entries(options));
}
