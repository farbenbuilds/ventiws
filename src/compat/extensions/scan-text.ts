/// Token, value, and whitespace reading for the extension header grammar. Kept apart from
/// the configuration scan so a refusal and a tolerated form stay two reviewable units.

/// RFC 6455 section 9.1 `tchar`, which a parameter name and an unquoted value both
/// have to be.
const TOKEN = /^[!#$%&'*+\-.0-9A-Z^_`|a-z~]+$/;

const COMMA = 0x2c;
const SEMICOLON = 0x3b;
const EQUALS = 0x3d;
const QUOTE = 0x22;

export const isWhitespace = (code: number): boolean => code === 0x20 || code === 0x09;

/// A parameter value, which is a token or a quoted string: the unescaped value and the
/// index just past it.
type ReadValue = { readonly value: string; readonly end: number };

export function readValue(header: string, start: number): ReadValue {
  if (header.charCodeAt(start) !== QUOTE) {
    const token = readToken(header, start, "a parameter value");

    if (token === null) throw unexpectedEnd(header, start);

    if (!TOKEN.test(token)) throw syntax(header, start, "invalid parameter value");

    return { value: token, end: start + token.length };
  }

  let index = start + 1;
  let value = "";

  for (;;) {
    if (index >= header.length) throw unexpectedEnd(header, start);
    const char = header.charAt(index);

    if (char === "\\") {
      const escaped = header[index + 1];

      if (escaped === undefined) throw unexpectedEnd(header, index);
      value += escaped;
      index += 2;
      continue;
    }

    // Unescaped without a second look, which is `ws`: RFC 6455 section 9.1.5 unescapes
    // into the value and nothing re-validates it. It cannot reach a response header
    // either, because a quoted value only matters to a parameter the negotiator already
    // knows, and a known `*_window_bits` parameter is a number it has to parse anyway.
    if (char === '"') return { value, end: index + 1 };
    value += char;
    index += 1;
  }
}

/// A run of token characters, or null when there is none there.
export function readToken(header: string, start: number, what: string): string | null {
  let index = start;

  while (index < header.length) {
    const code = header.charCodeAt(index);

    if (isWhitespace(code) || code === SEMICOLON || code === COMMA || code === EQUALS) break;

    if (code === QUOTE) throw syntax(header, index, `expected ${what}`);
    index += 1;
  }

  if (index === start) return null;

  return header.slice(start, index);
}

export function skipWhitespace(header: string, start: number): number {
  let index = start;

  while (index < header.length && isWhitespace(header.charCodeAt(index))) index += 1;

  return index;
}

export function syntax(header: string, at: number, detail: string): SyntaxError {
  return new SyntaxError(`Invalid Sec-WebSocket-Extensions header at ${at}: ${detail}`);
}

export function unexpectedEnd(header: string, at: number): SyntaxError {
  return new SyntaxError(`Unexpected end of Sec-WebSocket-Extensions header at ${at}`);
}
