// Which option reads reach into the compiled addon, and which do not.
//
// Its own module because the property is a boundary, not a behaviour: `ts-test.yml`
// runs this directory with the addon available, and the reason it has to is that
// normalization reads a compiled ceiling. What matters is that it reads it *only* when
// a value has to be compared against it, because a normalizer that loads a binary to
// compute a default is a normalizer that cannot be exercised without one.
// Every case counts the loader rather than replacing it, so a read that should not happen
// fails the test instead of passing because a binary happened to be present.

import { afterEach, expect, test, vi } from "vitest";
import * as load from "../../../src/binding/load";
import { codecLimits } from "../../../src/binding/codec";
import { normalizeClientOptions } from "../../../src/compat/options/client";
import { normalizeServerOptions } from "../../../src/compat/options/server";

const realLoad = load.loadAddon;
let calls = 0;
let armed = false;

/// The spy forwards to the real loader, so the cached addon is still the process's own.
vi.spyOn(load, "loadAddon").mockImplementation(() => {
  if (armed) calls += 1;

  return realLoad();
});

afterEach(() => {
  calls = 0;
  armed = false;
});

test("defaults are computed without the addon", () => {
  armed = true;
  const options = normalizeServerOptions({ noServer: true });
  // `ws`'s default, taken as a constant. It is below the codec's ceiling by
  // construction, so there is nothing to compare and nothing to read.
  expect(options.maxPayload).toBe(100 * 1024 * 1024);
  expect(options.maxFragments).toBe(16 * 1024);
  expect(calls).toBe(0);
});

test("client defaults are computed without the addon", () => {
  armed = true;
  const options = normalizeClientOptions();
  expect(options.maxPayload).toBe(100 * 1024 * 1024);
  expect(calls).toBe(0);
});

test("a maxPayload of zero reads the ceiling, because zero means the ceiling", () => {
  armed = true;
  // `0` is not "no limit" here: `ws` guards its own checks with `> 0`, so zero has to
  // become the real ceiling rather than a value nothing can be compared against.
  expect(normalizeServerOptions({ noServer: true, maxPayload: 0 }).maxPayload).toBe(
    codecLimits().maxPayloadBytes,
  );
  expect(calls).toBeGreaterThan(0);
});

test("a maxPayload above the ceiling is refused by name", () => {
  // The message names the option and the range, so a caller can fix it without reading
  // the source. A native ordinal at the first connection would not have named anything.
  expect(() =>
    normalizeServerOptions({ noServer: true, maxPayload: codecLimits().maxPayloadBytes + 1 }),
  ).toThrow(/maxPayload option must be an integer in/);
});

test("a maxFragments above the ceiling is refused by name", () => {
  // `maxFragments` is documented and defaulted by `ws`, so the public options record is
  // where a caller sets it; the ceiling is still the compiled one.
  const options = { maxFragments: codecLimits().maxFragments + 1 };
  expect(() => normalizeClientOptions(options)).toThrow(
    /maxFragments option must be an integer in/,
  );
});

test("a non-integer or negative value is refused whatever the ceiling is", () => {
  for (const value of [1.5, -1, Number.NaN, Number.POSITIVE_INFINITY, "1024", null]) {
    // SAFETY: these are the out-of-type values the normalizer is required to name and
    // refuse, so the fixture cannot satisfy the declared `number`.
    expect(() => normalizeServerOptions({ noServer: true, maxPayload: value as never })).toThrow(
      /maxPayload option must be an integer in/,
    );
  }
});
