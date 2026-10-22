import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { loadAddon } from "../../src/binding/load";

/// The publish workflow runs this file against a release built with
/// `-Dengine-addon=false` (ADR 0003), so it may only touch the public artifact.
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

/// The engine server is development-only. A release that leaks one of these is
/// shipping the full uWebZockets link the codec split exists to remove.
const ENGINE_FUNCTIONS = [
  "http3Available",
  "createServer",
  "listenServer",
  "sendSocket",
  "pumpSocket",
  "takeSocketMessage",
] as const;

const requires = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PUBLIC_ARTIFACT = join(ROOT, "zig-out", "lib", "ventiws.node");

type AddonSurface = {
  readonly [name: string]: ((...args: never[]) => void) | undefined;
};

function artifact(path: string): AddonSurface {
  // SAFETY: both build products export only functions; the assertions below hold each name to that.
  return requires(path) as AddonSurface;
}

test("the loader returns the public codec artifact at the pinned release", () => {
  const addon = loadAddon();

  expect(addon.engineVersion()).toBe("2.0.5");

  for (const name of CODEC_FUNCTIONS) expect(addon[name]).toBeTypeOf("function");

  for (const name of ENGINE_FUNCTIONS) expect(name in addon).toBe(false);
});

test("the public artifact file itself carries no engine ABI", () => {
  const addon = artifact(PUBLIC_ARTIFACT);

  for (const name of CODEC_FUNCTIONS) expect(addon[name]).toBeTypeOf("function");

  for (const name of ENGINE_FUNCTIONS) expect(name in addon).toBe(false);
});

test("the compiled capacities are coherent", () => {
  const limits = loadAddon().engineLimits();

  expect(limits.connectionCapacity).toBeGreaterThan(0);
  expect(limits.messageBytes).toBeGreaterThanOrEqual(65_536);
  // RFC 6455 section 5.5 caps a control frame at 125 bytes, so the frame cap admits one.
  expect(limits.frameBytes).toBeGreaterThanOrEqual(125);
  expect(limits.frameBytes).toBeLessThanOrEqual(limits.messageBytes);
  expect(limits.maxPayloadBytes).toBeGreaterThanOrEqual(100 * 1024 * 1024);
  expect(limits.inboundSlots).toBeGreaterThan(limits.outboundSlots);
  expect(limits.connectionCapacity).toBeGreaterThan(limits.outboundSlots);
});
