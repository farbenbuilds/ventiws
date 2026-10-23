// Server option normalization: the single listen target, `ws` defaults, per-message
// deflate, inherited properties, and the compiled ceilings on `maxPayload`.

import { expect, test } from "vitest";
import { codecLimits } from "../../../src/binding/codec";
import { normalizeServerOptions } from "../../../src/compat/options/server";

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

test("fills the ws server defaults", () => {
  const options = normalizeServerOptions({ noServer: true });
  expect(options.noServer).toBe(true);
  expect(options.clientTracking).toBe(true);
  expect(options.allowSynchronousEvents).toBe(true);
  expect(options.autoPong).toBe(true);
  expect(options.maxBufferedChunks).toBe(262144);
  expect(options.maxFragments).toBe(16384);
  expect(options.closeTimeout).toBe(30000);
  expect(options.maxPayload).toBe(100 * 1024 * 1024);
  expect(options.skipUTF8Validation).toBe(false);
  expect(options.perMessageDeflate).toBe(false);
  expect(options.host).toBeNull();
  expect(options.path).toBeNull();
});

test("requires exactly one listen target", () => {
  expect(() => normalizeServerOptions()).toThrow(/One and only one/);
  expect(() => normalizeServerOptions({ port: 0, noServer: true })).toThrow(TypeError);
  expect(normalizeServerOptions({ port: 0 }).port).toBe(0);
});

test("preserves explicit falsy and zero server values", () => {
  const options = normalizeServerOptions({
    noServer: true,
    clientTracking: false,
    allowSynchronousEvents: false,
    autoPong: false,
    maxPayload: 0,
    skipUTF8Validation: true,
  });

  expect(options.clientTracking).toBe(false);
  expect(options.allowSynchronousEvents).toBe(false);
  expect(options.autoPong).toBe(false);
  expect(options.maxPayload).toBe(codecLimits().maxPayloadBytes);
  expect(options.skipUTF8Validation).toBe(true);
});

test("normalizes per-message deflate to its ws defaults and keeps overrides", () => {
  expect(
    normalizeServerOptions({ noServer: true, perMessageDeflate: true }).perMessageDeflate,
  ).toEqual(PDT_DEFAULTS);
  expect(
    normalizeServerOptions({
      noServer: true,
      perMessageDeflate: {
        threshold: 512,
        serverNoContextTakeover: false,
        serverMaxWindowBits: 10,
        clientMaxWindowBits: 12,
      },
    }).perMessageDeflate,
  ).toEqual({
    ...PDT_DEFAULTS,
    serverNoContextTakeover: false,
    serverMaxWindowBits: 10,
    clientMaxWindowBits: 12,
    threshold: 512,
  });
});

test("ignores inherited option properties and evaluates getters once", () => {
  const polluted: { noServer?: boolean } = Object.create({ port: 8080 });
  polluted.noServer = true;
  expect(normalizeServerOptions(polluted).port).toBeNull();

  let reads = 0;

  const source = {
    noServer: true,
    get maxPayload(): number {
      reads += 1;

      return 1024;
    },
  };

  expect(normalizeServerOptions(source).maxPayload).toBe(1024);
  expect(reads).toBe(1);
});

test("treats a falsy server as absent and a falsy deflate as off", () => {
  // SAFETY: `0` is the falsy non-server a caller can pass; `ws` reads it as absent.
  expect(() => normalizeServerOptions({ server: 0 as never })).toThrow(/One and only one/);
  // SAFETY: `null` is the falsy out-of-type value `ws` reads as disabled.
  expect(
    normalizeServerOptions({ noServer: true, perMessageDeflate: null as never }).perMessageDeflate,
  ).toBe(false);
});

test("maxPayload and maxFragments above the compiled ceiling are refused by name", () => {
  const limits = codecLimits();
  expect(() =>
    normalizeServerOptions({ noServer: true, maxPayload: limits.maxPayloadBytes + 1 }),
  ).toThrow(/maxPayload option must be an integer in/);
  expect(() =>
    normalizeServerOptions({ noServer: true, maxFragments: limits.maxFragments + 1 }),
  ).toThrow(/maxFragments option must be an integer in/);
});

test.each([1.5, -1, Number.NaN, Number.POSITIVE_INFINITY, "1024", null])(
  "a non-integer maxPayload of %s is refused",
  (value) => {
    // SAFETY: the out-of-type values the normalizer must name and refuse.
    expect(() => normalizeServerOptions({ noServer: true, maxPayload: value as never })).toThrow(
      /maxPayload option must be an integer in/,
    );
  },
);
