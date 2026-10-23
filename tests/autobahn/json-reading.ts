/// JSON's data model, which is exactly what `JSON.parse` returns. The report
/// readers narrow on the built-in tag rather than on a declared document shape,
/// so a wrong shape becomes a typed error instead of an unchecked cast.

export type JsonValue = null | boolean | number | string | readonly JsonValue[] | JsonRecord;

export type JsonRecord = { readonly [key: string]: JsonValue };

const OBJECT_TAG = "[object Object]";
const STRING_TAG = "[object String]";
const NUMBER_TAG = "[object Number]";
const BOOLEAN_TAG = "[object Boolean]";

function tagOf(value: JsonValue): string {
  return Object.prototype.toString.call(value);
}

export function isJsonRecord(value: JsonValue): value is JsonRecord {
  return !Array.isArray(value) && tagOf(value) === OBJECT_TAG;
}

export function jsonString(value: JsonValue): string | null {
  return tagOf(value) === STRING_TAG ? String(value) : null;
}

export function jsonNumber(value: JsonValue): number | null {
  return tagOf(value) === NUMBER_TAG ? Number(value) : null;
}

export function jsonInteger(value: JsonValue): number | null {
  const parsed = jsonNumber(value);

  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
}

export function jsonBoolean(value: JsonValue): boolean | null {
  return tagOf(value) === BOOLEAN_TAG ? value === true : null;
}
