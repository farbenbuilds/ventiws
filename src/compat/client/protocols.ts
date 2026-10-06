export type ProtocolSet = ReadonlySet<string>;

export function protocolSet(protocols: readonly string[]): ProtocolSet {
  return new Set(protocols);
}

/// `new WebSocket(address, options)` is a declared overload, so a non-array object in the
/// subprotocol slot is promoted to the options slot, as `ws` does and `@types/ws` declares.
export function promoteOptions<T>(
  protocols: string | string[] | undefined,
  options: T | undefined,
): { protocols: string | string[] | undefined; options: T | undefined } {
  if (typeof protocols !== "object" || protocols === null || Array.isArray(protocols)) {
    return { protocols, options };
  }
  return { protocols: undefined, options: protocols as unknown as T };
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
