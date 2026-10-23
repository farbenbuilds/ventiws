/// Runtime decoders for values a JavaScript caller can put where the declarations say a
/// string or a number goes; each proves the domain value rather than the representation.

/// The tag test refuses symbols and objects without coercing them; the coercion identity
/// then excludes boxed strings, which a header or subprotocol cannot carry.
export function isStringValue(value: unknown): value is string {
  return Object.prototype.toString.call(value) === "[object String]" && String(value) === value;
}

/// Identity with the numeric coercion accepts a number primitive (including `Infinity` and
/// `NaN`, which callers report separately) and refuses a string that would coerce cleanly.
export function isNumberValue(value: unknown): value is number {
  try {
    return Object.is(Number(value), value);
  } catch {
    return false;
  }
}
