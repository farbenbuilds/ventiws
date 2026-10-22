import { existsSync, readFileSync } from "node:fs";

import { expect, test } from "vitest";

test("the napi-zig fork is pinned by tag and commit", () => {
  const manifest = readFileSync("build.zig.zon", "utf8");

  expect(manifest).toContain("github.com/farbenbuilds/napi-zig?ref=v0.3.1-ventiws.1#");
  expect(existsSync("docs/forks.md")).toBe(true);
});

test("the fork policy names upstream and the carried patch", () => {
  const policy = readFileSync("docs/forks.md", "utf8");

  expect(policy).toContain("yuku-toolchain/napi-zig");
  expect(policy).toContain("options.optimize");
  expect(policy).toContain("v0.3.1-ventiws.1");
});
