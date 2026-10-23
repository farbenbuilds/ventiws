// The loader cannot ask the build graph, so install-time targets and error text are pinned here.

import { expect, test, vi } from "vitest";
import { missingAddonMessage } from "../../src/binding/addon-error";
import type { HostLibc } from "../../src/binding/host-libc";
import { openAddon } from "../../src/binding/open";
import { runtimeName } from "../../src/binding/runtime";
import {
  addonTarget,
  bindingPackageName,
  PUBLISHED_TARGETS,
  type AddonTarget,
} from "../../src/binding/target";

type TargetCase = readonly [string, string, HostLibc, AddonTarget | undefined];

const TARGET_CASES: readonly TargetCase[] = [
  ["linux", "x64", "gnu", "linux-x64-gnu"],
  ["linux", "x64", "musl", "linux-x64-musl"],
  ["linux", "arm64", "gnu", "linux-arm64-gnu"],
  ["linux", "arm64", "musl", undefined],
  ["darwin", "x64", "gnu", "darwin-x64"],
  ["darwin", "x64", "musl", "darwin-x64"],
  ["darwin", "arm64", "gnu", "darwin-arm64"],
  ["darwin", "arm64", "musl", "darwin-arm64"],
  ["win32", "x64", "gnu", undefined],
  ["freebsd", "x64", "gnu", undefined],
  ["aix", "ppc64", "gnu", undefined],
];

test.each(TARGET_CASES)("%s-%s-%s resolves to %s", (platform, arch, libc, expected) => {
  expect(addonTarget(platform, arch, libc)).toBe(expected);
});

test("the published target list names one scoped package each", () => {
  expect(PUBLISHED_TARGETS).toEqual([
    "linux-x64-gnu",
    "linux-arm64-gnu",
    "linux-x64-musl",
    "darwin-x64",
    "darwin-arm64",
  ]);

  for (const target of PUBLISHED_TARGETS) {
    expect(bindingPackageName(target)).toBe(`@ventiws/binding-${target}`);
  }
});

type MissingCase = {
  readonly name: string;
  readonly root: string | undefined;
  readonly platform: string;
  readonly arch: string;
  readonly target: AddonTarget | undefined;
  readonly must: readonly string[];
  readonly mustNot?: readonly string[];
};

const MISSING_CASES: readonly MissingCase[] = [
  {
    name: "an installed target that npm skipped",
    root: "/opt/app/node_modules/ventiws",
    platform: "linux",
    arch: "x64",
    target: "linux-x64-gnu",
    must: [
      "linux-x64-gnu",
      "/opt/app/node_modules/ventiws",
      "optional dependency",
      "pnpm build:binding",
    ],
  },
  {
    name: "a broken package layout",
    root: undefined,
    platform: "linux",
    arch: "x64",
    target: "linux-x64-gnu",
    must: ["Reinstalling"],
    mustNot: ["pnpm build:binding"],
  },
  {
    name: "an unpublished platform",
    root: "/opt/app/node_modules/ventiws",
    platform: "freebsd",
    arch: "x64",
    target: undefined,
    must: ["freebsd-x64", "linux-x64-gnu", "pnpm build:binding"],
  },
];

test.each(MISSING_CASES)("the missing-addon message explains $name", (missing) => {
  const message = missingAddonMessage(
    missing.root,
    missing.platform,
    missing.arch,
    missing.target,
    PUBLISHED_TARGETS,
  );

  for (const text of missing.must) expect(message).toContain(text);

  for (const text of missing.mustNot ?? []) expect(message).not.toContain(text);
});

test("a Bun host is pointed at bun install", () => {
  const message = missingAddonMessage(
    "/app/node_modules/ventiws",
    "linux",
    "x64",
    "linux-x64-gnu",
    PUBLISHED_TARGETS,
    "bun",
  );

  expect(message).toContain("bun install");
});

test("the opener goes through require, not dlopen", () => {
  const dlopen = vi.spyOn(process, "dlopen");

  try {
    expect(() => openAddon("/nonexistent/ventiws-test.node")).toThrow(
      expect.objectContaining({ code: "MODULE_NOT_FOUND" }),
    );
    expect(dlopen).not.toHaveBeenCalled();
  } finally {
    dlopen.mockRestore();
  }
});

test("runtime detection reads both Bun signals", () => {
  expect(runtimeName()).toBe("node");

  vi.stubGlobal("Bun", { version: "1.2.0" });

  try {
    expect(runtimeName()).toBe("bun");
  } finally {
    vi.unstubAllGlobals();
  }

  process.versions.bun = "1.2.0";

  try {
    expect(runtimeName()).toBe("bun");
  } finally {
    delete process.versions.bun;
  }
});
