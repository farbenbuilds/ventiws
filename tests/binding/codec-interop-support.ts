import type { WebSocketServer as WsServer } from "ws";
import { CODEC_KINDS, encodeCodecFrame } from "../../src/binding/codec";
import { addressPort } from "./port-support";

/// `encode` takes an ordinal, and a decoded event reports a name, so the ordinal is
/// named here rather than written as a bare `indexOf` result at each use.
const TEXT_ORDINAL = CODEC_KINDS.indexOf("text");

/// The port a `ws` server bound, which its type widens to an address or a pipe path.
export function boundPort(server: WsServer): number {
  return addressPort(server.address()) ?? 0;
}

/// One complete, uncompressed text frame: the `false` is `compress`, so nothing here
/// depends on RFC 7692.
export function frame(handle: bigint, text: string): number {
  return encodeCodecFrame(handle, TEXT_ORDINAL, true, Buffer.from(text), false);
}
