/// A value parsed from JSON before an owner-specific schema has validated it. The
/// union is the whole JSON domain, so a decoder branches on the parsed value rather
/// than on a runtime type tag.
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type JsonObject = { readonly [key: string]: JsonValue };

/// Objects and arrays are the only JSON values that pass `instanceof Object`; a
/// primitive wraps to a fresh object, so the identity check rejects it.
export const isJsonObject = (value: JsonValue): value is JsonObject =>
  value !== null && value instanceof Object && !Array.isArray(value);

/// A primitive string is the only JSON value whose prototype tag is `String`.
export const isText = (value: JsonValue | undefined): value is string =>
  Object.prototype.toString.call(value) === "[object String]";

export const isPositiveInteger = (value: JsonValue | undefined): value is number =>
  Number.isInteger(value) && Number(value) > 0;
