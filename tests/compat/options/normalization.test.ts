import { expect, test } from "vitest";
import { normalizeClientOptions } from "../../../src/compat/options/client";
import { normalizeProtocols } from "../../../src/compat/options/shared";
import { normalizeServerOptions } from "../../../src/compat/options/server";

/// The error a normalizer raised, narrowed, so a caller reads the stable fields rather than
/// an unparsed `unknown`.
function capture(fn: () => void): Error | undefined {
  try {
    fn();
  } catch (error) {
    if (error instanceof Error) return error;

    throw error;
  }

  return undefined;
}

test("throws coded errors with the ws classes and messages", () => {
  expect(capture(() => normalizeServerOptions())).toMatchObject({
    message: 'One and only one of the "port", "server", or "noServer" options must be specified',
    code: "ERR_INVALID_OPTION",
  });
  expect(capture(() => normalizeClientOptions({ protocolVersion: 9 }))).toBeInstanceOf(RangeError);
  expect(capture(() => normalizeClientOptions({ protocolVersion: 9 }))).toMatchObject({
    message: "Unsupported protocol version: 9 (supported versions: 8, 13)",
    code: "ERR_INVALID_OPTION",
  });
  expect(capture(() => normalizeProtocols("bad protocol"))).toBeInstanceOf(SyntaxError);
  expect(capture(() => normalizeProtocols("bad protocol"))).toMatchObject({
    message: "An invalid or duplicated subprotocol was specified",
    code: "ERR_INVALID_OPTION",
  });
});

test("validates subprotocols against the ws token grammar", () => {
  expect(normalizeProtocols("chat")).toEqual(["chat"]);
  expect(normalizeProtocols(["chat", "superchat"])).toEqual(["chat", "superchat"]);
  expect(normalizeProtocols(undefined)).toEqual([]);
  expect(() => normalizeProtocols("bad protocol")).toThrow(SyntaxError);
  expect(() => normalizeProtocols(["chat", "chat"])).toThrow(SyntaxError);
});

test.each([5, null])("wraps the out-of-type value %s the way ws does", (value) => {
  // SAFETY: the argument is deliberately outside the declared union; `ws` reports it as a
  // SyntaxError at runtime rather than a TypeError.
  expect(() => normalizeProtocols(value as never)).toThrow(SyntaxError);
});

test("a falsy client per-message deflate value disables the extension", () => {
  for (const value of [null, 0]) {
    // SAFETY: `null` and `0` are the falsy out-of-type values `ws` reads as "disabled".
    expect(normalizeClientOptions({ perMessageDeflate: value as never }).perMessageDeflate).toBe(
      false,
    );
  }

  expect(normalizeClientOptions({ perMessageDeflate: false }).perMessageDeflate).toBe(false);
  expect(normalizeClientOptions({ perMessageDeflate: true }).perMessageDeflate).not.toBe(false);
  expect(normalizeClientOptions().perMessageDeflate).not.toBe(false);
});

test("returns a copy of the caller's protocol array", () => {
  const input = ["chat"];
  const protocols = normalizeProtocols(input);
  expect(protocols).not.toBe(input);
  input.push("superchat");
  expect(protocols).toEqual(["chat"]);
});
