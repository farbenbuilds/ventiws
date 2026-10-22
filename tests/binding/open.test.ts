// The opener is selected per runtime, and the Deno branch is the one no Node test run
// can exercise for real: stubbing the global and the primitive is what keeps it covered.

import process from "node:process";
import { afterEach, expect, test, vi } from "vitest";
import { openAddon } from "../../src/binding/open";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function caughtCode(call: () => void): string | undefined {
  try {
    call();

    return undefined;
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code === undefined) {
      return undefined;
    }

    return String(error.code);
  }
}

test("a Deno host opens through process.dlopen", () => {
  vi.stubGlobal("Deno", { version: { deno: "2.8.0" }, build: { env: "gnu" } });
  const addon = { engineVersion: (): string => "stub" };

  const dlopen = vi.spyOn(process, "dlopen").mockImplementation((module) => {
    Object.assign(module, { exports: addon });
  });

  expect(openAddon("/opt/app/ventiws.node")).toBe(addon);
  expect(dlopen).toHaveBeenCalledWith(expect.anything(), "/opt/app/ventiws.node", 0);
});

test("a Node host opens through require, not process.dlopen", () => {
  // A missing path is enough: require fails MODULE_NOT_FOUND, where the Deno branch
  // would have reached the stubbed primitive first.
  const dlopen = vi.spyOn(process, "dlopen");
  expect(caughtCode(() => openAddon("/nonexistent/ventiws-test.node"))).toBe("MODULE_NOT_FOUND");
  expect(dlopen).not.toHaveBeenCalled();
});
