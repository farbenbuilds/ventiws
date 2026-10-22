// Node and Bun share the CommonJS loader, so a missing path is enough to prove the
// opener reaches `require` rather than a second runtime branch.

import { expect, test, vi } from "vitest";
import { openAddon } from "../../src/binding/open";

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

test("the opener goes through require", () => {
  const dlopen = vi.spyOn(process, "dlopen");
  expect(caughtCode(() => openAddon("/nonexistent/ventiws-test.node"))).toBe("MODULE_NOT_FOUND");
  expect(dlopen).not.toHaveBeenCalled();
  dlopen.mockRestore();
});
