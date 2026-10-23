import type { ClientOptions, ServerOptions } from "../../types/ws";
import { isCallable } from "../callable";

export type ProtocolSet = ReadonlySet<string>;

/// The options-slot overload's promoted pair: the subprotocols stay in their raw form so
/// `normalizeProtocols` is the one place that refuses an invalid list.
export type PromotedOptions = {
  readonly protocols: string | string[] | undefined;
  readonly options: ClientOptions | ServerOptions | undefined;
};

export function protocolSet(protocols: readonly string[]): ProtocolSet {
  return new Set(protocols);
}

/// `new WebSocket(address, options)` is a declared overload, so a non-array object in the
/// subprotocol slot is promoted to the options slot, as `ws` does and `@types/ws` declares.
export function promoteOptions(
  protocols: string | string[] | ClientOptions | ServerOptions | undefined,
  options: ClientOptions | ServerOptions | undefined,
): PromotedOptions {
  if (!isOptionsSlot(protocols)) return { protocols, options };

  return { protocols: undefined, options: protocols };
}

/// `ws` promotes only an object in the slot, so a boxed primitive or a function stays a
/// subprotocol and is refused by the validator.
function isOptionsSlot(
  value: string | string[] | ClientOptions | ServerOptions | undefined,
): value is ClientOptions | ServerOptions {
  return Object(value) === value && !Array.isArray(value) && !isCallable(value);
}

/// A server that picks nothing when the client offered something is a protocol error
/// rather than a default: the client asked for a subprotocol and would otherwise have no
/// way to notice it got something else.
export function protocolRejection(chosen: string | undefined, offered: ProtocolSet): string | null {
  if (chosen === undefined) {
    return offered.size > 0 ? "Server sent no subprotocol" : null;
  }

  if (offered.size === 0) return "Server sent a subprotocol but none was requested";

  if (!offered.has(chosen)) return "Server sent an invalid subprotocol";

  return null;
}
