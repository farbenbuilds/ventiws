import { readFileSync } from "node:fs";

import { expect, test } from "vitest";

test("cross-compiled release bindings use ReleaseSafe", () => {
  const source = readFileSync("scripts/build-bindings.mjs", "utf8");

  expect(source).toContain('"--release=safe"');
  expect(source).not.toContain('"--release=fast"');
});
