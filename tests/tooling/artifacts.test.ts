// The published platform set is stated in three places that cannot import each other:
// the manifest the build graph reads, the loader that resolves it, and the workflow that
// schedules a runner for it. The release mode is the other half: codec-only, ReleaseSafe.

import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { PUBLISHED_TARGETS } from "../../src/binding/target";

const ROOT = new URL("../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, ROOT), "utf8");
const PLATFORM_MANIFEST = read("src/builds/platforms.json");
const PLATFORMS_ZIG = read("src/builds/platforms.zig");
const PUBLISH_YML = read(".github/workflows/publish.yml");
const BINDINGS_SCRIPT = read("scripts/build-bindings.mjs");
const STAGE_SCRIPT = read("scripts/stage-publish.mjs");

type PlatformsManifest = { readonly platforms: string[] };

function declaredPlatforms(): string[] {
  const manifest: PlatformsManifest = JSON.parse(PLATFORM_MANIFEST);

  return manifest.platforms.sort();
}

type Shard = { readonly os: string; readonly platform: string };

/// One entry per `platform:` the workflow schedules, paired with the `os:` above it, so
/// the runner is bound to its platform rather than compared as two independent scans.
function scheduledShards(): Shard[] {
  return [...PUBLISH_YML.matchAll(/os: ([\w.-]+)\s*\n\s*platform: ([\w-]+)/g)].map((match) => ({
    os: match[1],
    platform: match[2],
  }));
}

function scheduledTargets(): string[] {
  return [
    ...scheduledShards().map((shard) => shard.platform),
    ...[...PUBLISH_YML.matchAll(/build-bindings\.mjs --platform=([\w-]+)/g)].map(
      (match) => match[1],
    ),
  ].sort();
}

test("the manifest, the build graph, and the loader declare the same platforms", () => {
  expect(declaredPlatforms()).toEqual([...PUBLISHED_TARGETS].sort());
  expect(PLATFORMS_ZIG).toContain("platforms.json");
  expect(PLATFORMS_ZIG).not.toMatch(/pub const published/);
});

test("the release gate reads the manifest, not a shard's scaffold", () => {
  // Reading `optionalDependencies` out of the merged scaffold rejected a complete
  // release: the merged manifest names one platform, the release built all of them.
  expect(STAGE_SCRIPT).toContain("src/builds/platforms.json");
  expect(STAGE_SCRIPT).not.toContain("optionalDependencies ?? {}");
});

test("every published platform is built on a native runner in the release workflow", () => {
  expect(scheduledTargets()).toEqual(declaredPlatforms());

  const native = new Map([
    ["linux-x64-gnu", "ubuntu-24.04"],
    ["linux-arm64-gnu", "ubuntu-24.04-arm"],
    ["darwin-x64", "macos-15-intel"],
    ["darwin-arm64", "macos-15"],
  ]);

  const shards = scheduledShards();
  expect(shards.length).toBeGreaterThan(0);

  // Family alone is not the claim: `ubuntu-24.04` is x64 and `ubuntu-24.04-arm` arm64,
  // and a cross-compiled addon links a foreign BoringSSL that misbehaves later.
  for (const shard of shards) expect(shard.os).toBe(native.get(shard.platform));
});

test("the musl platform is built in a musl container, not on a glibc runner", () => {
  const job = PUBLISH_YML.split(/\n {2}(?=bindings-musl:)/)[1] ?? "";
  expect(job).toContain("container: node:24-alpine");
  expect(job).toContain("--platform=linux-x64-musl");
});

test("the build script narrows the platform list and the release mode", () => {
  // A shard passes `-Dnpm-platform`; a list in the script would let the workflow and the
  // build graph each add a platform the other misses. ReleaseSafe skips the engine addon.
  expect(BINDINGS_SCRIPT).toContain("-Dnpm-platform=");
  expect(BINDINGS_SCRIPT).not.toMatch(/linux-x64-gnu|darwin-arm64|win32-x64/);
  expect(BINDINGS_SCRIPT).toContain('"--release=safe"');
  expect(BINDINGS_SCRIPT).toContain('"-Dengine-addon=false"');
  expect(BINDINGS_SCRIPT).not.toContain('"--release=fast"');
});

test("the staged packages are build output, not source", () => {
  // Split on the line ending the host wrote: a gate that only reads LF would fail on
  // the platform it is meant to protect.
  expect(read(".gitignore").split(/\r?\n/)).toContain("npm/");
});
