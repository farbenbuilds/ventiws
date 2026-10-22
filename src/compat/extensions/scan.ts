/// The configuration scanner behind the extension header grammar. Kept apart from the
/// grammar because a scanner change that alters a refusal is a compatibility change, and a
/// grammar change that stops refusing something is one too.

import { readToken, readValue, skipWhitespace, syntax, unexpectedEnd } from "./scan-text";

const COMMA = 0x2c;
const SEMICOLON = 0x3b;
const EQUALS = 0x3d;

/// A comma ends the *configuration*, not the extension: `permessage-deflate; a,
/// permessage-deflate; b` is two offers of one name, and RFC 7692 section 7.1.1.1 lets a
/// client send exactly that so a server with a narrow window can be offered a second
/// configuration after the first is declined.
export type ScannedConfiguration = {
  readonly name: string;
  readonly parameters: Readonly<Record<string, readonly string[]>>;
  readonly rest: number;
};

export function scanConfiguration(header: string, start: number): ScannedConfiguration {
  const name = readToken(header, start, "an extension name");

  if (name === null) throw unexpectedEnd(header, start);
  const parameters: Record<string, string[]> = {};
  let index = start + name.length;

  for (;;) {
    index = skipWhitespace(header, index);

    if (index >= header.length || header.charCodeAt(index) === COMMA) break;

    if (header.charCodeAt(index) !== SEMICOLON) {
      throw syntax(header, index, "expected ';' or ','");
    }

    const afterSemicolon = skipWhitespace(header, index + 1);

    // A trailing `;` names no parameter, which `ws` tolerates: a semicolon separates
    // parameters rather than ending the list.
    if (afterSemicolon >= header.length) {
      index = afterSemicolon;
      break;
    }

    index = readParameter(header, index, parameters);
  }

  return { name, parameters, rest: index };
}

/// Reads one `; name` or `; name=value` group, returning the index after it.
function readParameter(header: string, start: number, into: Record<string, string[]>): number {
  const nameStart = skipWhitespace(header, start + 1);
  const name = readToken(header, nameStart, "a parameter name");

  if (name === null) throw unexpectedEnd(header, nameStart);
  const afterEquals = skipWhitespace(header, nameStart + name.length);

  if (header.charCodeAt(afterEquals) !== EQUALS) {
    push(into, name, "");

    return afterEquals;
  }

  const value = readValue(header, skipWhitespace(header, afterEquals + 1));
  push(into, name, value.value);

  // The end of the scan, not `afterEquals + 1 + width`: whitespace is allowed after the
  // `=`, so adding a width to the position of the `=` walks the index back into the value
  // and reports a parse error on a header `ws` reads without complaint.
  return value.end;
}

function push(into: Record<string, string[]>, name: string, value: string): void {
  const existing = into[name];

  if (existing === undefined) into[name] = [value];
  else existing.push(value);
}
