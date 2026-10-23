/// The `ws` argument surfaces the facade validates. Each check is written without `typeof`
/// so the boundary names the value it accepts rather than the representation it reads.

import type { BinaryTypeValue } from "../../types/socket";
import { isCallable } from "../callable";

export { isNumberValue, isStringValue } from "../scalars";

/// The callback `ws` takes in the final argument position of `send`, `ping`, `pong`, and
/// `close`. A cross-realm function is the one callable `instanceof Function` misses.
export type SocketCallback = (error?: Error) => void;

export function isCallback(value: unknown): value is SocketCallback {
  return isCallable(value);
}

export function isBinaryTypeValue(value: string): value is BinaryTypeValue {
  return (
    value === "nodebuffer" || value === "arraybuffer" || value === "fragments" || value === "blob"
  );
}
