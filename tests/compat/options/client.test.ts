// Client option normalization: the `ws` defaults, explicit falsy values, protocol
// grammar, header copies, and the close deadline's range.

import { expect, test } from "vitest";
import { codecLimits } from "../../../src/binding/codec";
import { normalizeClientOptions } from "../../../src/compat/options/client";
import { normalizeProtocols } from "../../../src/compat/options/shared";

const PDT_DEFAULTS = {
  serverNoContextTakeover: undefined,
  clientNoContextTakeover: undefined,
  serverMaxWindowBits: undefined,
  clientMaxWindowBits: undefined,
  threshold: 1024,
  concurrencyLimit: 10,
  zlibDeflateOptions: undefined,
  zlibInflateOptions: undefined,
};

test("fills the ws client defaults", () => {
  const options = normalizeClientOptions();
  expect(options.protocolVersion).toBe(13);
  expect(options.followRedirects).toBe(false);
  expect(options.maxRedirects).toBe(10);
  expect(options.maxPayload).toBe(100 * 1024 * 1024);
  expect(options.skipUTF8Validation).toBe(false);
  expect(options.headers).toBeUndefined();
  expect(options.perMessageDeflate).toEqual(PDT_DEFAULTS);
});

test("rejects unsupported protocol versions like ws", () => {
  expect(() => normalizeClientOptions({ protocolVersion: 9 })).toThrow(RangeError);
  expect(normalizeClientOptions({ protocolVersion: 8 }).protocolVersion).toBe(8);
});

test("preserves explicit falsy and zero client values", () => {
  const options = normalizeClientOptions({
    followRedirects: true,
    maxRedirects: 0,
    maxPayload: 0,
    skipUTF8Validation: true,
    allowSynchronousEvents: false,
    autoPong: false,
    perMessageDeflate: false,
  });

  expect(options.followRedirects).toBe(true);
  expect(options.maxRedirects).toBe(0);
  // Zero is `ws`'s "no limit"; the codec's representation is its ceiling.
  expect(options.maxPayload).toBe(codecLimits().maxPayloadBytes);
  expect(options.skipUTF8Validation).toBe(true);
  expect(options.allowSynchronousEvents).toBe(false);
  expect(options.autoPong).toBe(false);
  expect(options.perMessageDeflate).toBe(false);
});

test("copies client headers instead of aliasing them", () => {
  const headers = { a: "1" };
  const options = normalizeClientOptions({ headers });
  expect(options.headers).toEqual({ a: "1" });
  expect(options.headers).not.toBe(headers);
  headers.a = "2";
  expect(options.headers).toEqual({ a: "1" });
});

test("a falsy per-message deflate value disables the extension", () => {
  for (const value of [null, 0]) {
    // SAFETY: `null` and `0` are the falsy out-of-type values `ws` reads as disabled.
    expect(normalizeClientOptions({ perMessageDeflate: value as never }).perMessageDeflate).toBe(
      false,
    );
  }
});

test("validates subprotocols against the ws token grammar", () => {
  expect(normalizeProtocols("chat")).toEqual(["chat"]);
  expect(normalizeProtocols(["chat", "superchat"])).toEqual(["chat", "superchat"]);
  expect(normalizeProtocols(undefined)).toEqual([]);
  expect(() => normalizeProtocols("bad protocol")).toThrow(SyntaxError);
  expect(() => normalizeProtocols(["chat", "chat"])).toThrow(SyntaxError);
});

test("out-of-type subprotocols are a SyntaxError like ws", () => {
  for (const value of [5, null]) {
    // SAFETY: the argument is deliberately outside the declared union.
    expect(() => normalizeProtocols(value as never)).toThrow(SyntaxError);
  }
});

test("returns a copy of the caller's protocol array", () => {
  const input = ["chat"];
  const protocols = normalizeProtocols(input);
  expect(protocols).not.toBe(input);
  input.push("superchat");
  expect(protocols).toEqual(["chat"]);
});

test("the close deadline must be a non-negative number", () => {
  for (const value of [-1, "soon", Number.NaN]) {
    // SAFETY: the runtime values the normalizer must name and refuse.
    expect(() => normalizeClientOptions({ closeTimeout: value } as never)).toThrow(
      /non-negative number/,
    );
  }

  // SAFETY: zero is the documented "no deadline" value the normalizer accepts.
  expect(normalizeClientOptions({ closeTimeout: 0 } as never).closeTimeout).toBe(0);
});
