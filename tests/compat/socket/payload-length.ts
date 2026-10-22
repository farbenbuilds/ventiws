import type { RawData } from "../../../src/index";

/// The payload length of a delivered message, for the three forms `ws` can hand over.
export function byteLengthOf(data: RawData): number {
  if (Array.isArray(data)) return data.reduce((total, part) => total + part.length, 0);

  if (data instanceof ArrayBuffer) return data.byteLength;

  return data.length;
}
