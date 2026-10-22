import { expect, test } from "vitest";
import { loadAddon } from "../../src/binding/load";

/// The publish workflow runs this file against a release build that passes
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

test("loads the native addon", () => {
  expect(loadAddon().engineVersion).toBeTypeOf("function");
});

test("reports the pinned uWebZockets release", () => {
  expect(loadAddon().engineVersion()).toBe("2.0.0");
});

test.each(CODEC_FUNCTIONS)("the public addon exposes %s", (name) => {
  expect(loadAddon()[name]).toBeTypeOf("function");
});

test.each(ENGINE_FUNCTIONS)("the public addon omits %s", (name) => {
  expect(name in loadAddon()).toBe(false);
});

/// `capacities.zig` calls each of these "a promise the compatibility layer has to
/// keep", and the promise is only checkable if the build reports what it compiled.
/// A restated TypeScript copy is a second source of truth, and that is how the
/// message cap came to be 64 KiB in the engine while a test still asserted
/// 32 KiB and passed.
test("the addon reports the capacities it was compiled with", () => {
  const limits = loadAddon().engineLimits();
  expect(limits.connectionCapacity).toBeGreaterThan(0);
  expect(limits.messageBytes).toBeGreaterThan(0);
  // A frame can never exceed a message, so the frame cap tracks it.
  expect(limits.frameBytes).toBeLessThanOrEqual(limits.messageBytes);
  expect(limits.inboundSlots).toBeGreaterThan(limits.outboundSlots);
});

/// RFC 6455 section 5.5 caps a control frame at 125 bytes, so the frame cap has
/// to admit one whatever the message cap is.
test("the frame cap admits a maximum control frame", () => {
  expect(loadAddon().engineLimits().frameBytes).toBeGreaterThanOrEqual(125);
});
