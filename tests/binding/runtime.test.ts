// Runtime detection is the seam a Bun host crosses. A bundler can carry the versions
// key without the global, so both signals are pinned without Bun installed.

import { afterEach, expect, test, vi } from "vitest";
import { runtimeName } from "../../src/binding/runtime";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.versions.bun;
});

test("a Node host reports node", () => {
  expect(runtimeName()).toBe("node");
});

test("a Bun global reports bun", () => {
  vi.stubGlobal("Bun", { version: "1.2.0" });
  expect(runtimeName()).toBe("bun");
});

test("the versions key identifies Bun with no global", () => {
  process.versions.bun = "1.2.0";
  expect(runtimeName()).toBe("bun");
});
