/// The four `send` options `ws` reads, resolved once per call. A value of the wrong runtime
/// type falls back to the default rather than being coerced, which is what `ws` does.

import { isCallable } from "../callable";

export type SendOptions = {
  readonly binary?: boolean;
  readonly fin?: boolean;
  readonly compress?: boolean;
  readonly mask?: boolean;
};

/// Any non-null object can carry the four optional keys; the getters below decide which
/// ones actually hold a boolean.
function isSendOptions<Options>(value: Options): value is Options & SendOptions {
  return Object(value) === value && !isCallable(value);
}

export function sendOptionsFrom<Options>(options: Options): SendOptions | undefined {
  return isSendOptions(options) ? options : undefined;
}

export function booleanOption(value: boolean | undefined, fallback: boolean): boolean {
  if (value === true || value === false) return value;

  return fallback;
}
