import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PUBLIC_ARTIFACT = join(ROOT, "zig-out", "lib", "ventiws.node");
const ENGINE_ARTIFACT = join(ROOT, "zig-out", "lib", "ventiws-engine.node");
const require = createRequire(import.meta.url);

/// Holds the two build products apart, so it loads the raw artifacts: the loaders
/// cache by module and must never be the thing that decides which ABI is present.
type AddonSurface = {
  readonly [name: string]: (...args: never[]) => void;
};

const CODEC_FUNCTIONS = [
  "codecCreate",
  "codecDestroy",
  "codecFeed",
  "codecResume",
  "codecPending",
  "codecSelect",
  "codecEvent",
  "codecFragments",
  "codecNext",
  "codecProcessInto",
  "codecMaterialize",
  "codecTake",
  "codecEncode",
  "codecWrite",
  "codecHeader",
  "codecOutbound",
  "codecOutboundMasked",
  "codecFailureCode",
  "codecFailure",
  "codecReset",
  "codecRole",
  "codecCeilings",
] as const;

const ENGINE_FUNCTIONS = [
  "http3Available",
  "createServer",
  "listenServer",
  "closeServer",
  "finalizeServer",
  "sendSocket",
  "closeSocket",
  "pauseSocket",
  "resumeSocket",
  "pumpSocket",
  "takeSocketMessage",
  "purgeSocketMessage",
  "socketBufferedAmount",
  "serverDroppedEvents",
  "serverDroppedMessages",
  "serverUndeliveredMessages",
] as const;

function artifact(path: string): AddonSurface {
  // SAFETY: both build products export only functions, and the assertions below
  // are what hold each name to that shape.
  return require(path) as AddonSurface;
}

test("the public artifact exposes the codec and the compiled limits", () => {
  const addon = artifact(PUBLIC_ARTIFACT);

  for (const name of CODEC_FUNCTIONS) expect(addon[name]).toBeTypeOf("function");
  expect(addon["engineVersion"]).toBeTypeOf("function");
  expect(addon["engineLimits"]).toBeTypeOf("function");
});

test.each(ENGINE_FUNCTIONS)("the public artifact omits %s", (name) => {
  expect(name in artifact(PUBLIC_ARTIFACT)).toBe(false);
});

describe.skipIf(!existsSync(ENGINE_ARTIFACT))("the development artifact", () => {
  test("exposes the engine surface alongside the codec", () => {
    const addon = artifact(ENGINE_ARTIFACT);

    for (const name of CODEC_FUNCTIONS) expect(addon[name]).toBeTypeOf("function");

    for (const name of ENGINE_FUNCTIONS) expect(addon[name]).toBeTypeOf("function");

    expect(addon["engineVersion"]).toBeTypeOf("function");
    expect(addon["engineLimits"]).toBeTypeOf("function");
  });
});
