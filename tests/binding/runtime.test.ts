// Runtime detection is the seam a Deno or Bun host crosses: the loader, the libc probe,
// and the install advice all read it, so each answer is pinned here without either
// runtime installed.

import { afterEach, expect, test, vi } from "vitest";
import { runtimeName } from "../../src/binding/runtime";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.versions.deno;
  delete process.versions.bun;
});

test("a Node host reports node", () => {
  expect(runtimeName()).toBe("node");
});

test("a Deno global wins over Deno's Node-compatible process", () => {
  // Deno answers `process.versions.node`, so `node` must not be read before `deno`.
  vi.stubGlobal("Deno", { version: { deno: "2.8.0" }, build: { env: "gnu" } });
  expect(runtimeName()).toBe("deno");
});

test("a Bun global reports bun", () => {
  vi.stubGlobal("Bun", { version: "1.2.0" });
  expect(runtimeName()).toBe("bun");
});

test("Deno wins when both runtime globals are present", () => {
  vi.stubGlobal("Deno", { version: { deno: "2.8.0" } });
  vi.stubGlobal("Bun", { version: "1.2.0" });
  expect(runtimeName()).toBe("deno");
});

test("the versions keys identify a runtime with no global", () => {
  // A bundler's `node:process` shim can carry the versions key without the global.
  process.versions.deno = "2.8.0";
  expect(runtimeName()).toBe("deno");
  delete process.versions.deno;
  process.versions.bun = "1.2.0";
  expect(runtimeName()).toBe("bun");
});
