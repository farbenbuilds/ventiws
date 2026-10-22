// `stage-publish.mjs` gates a release against the platform set a runner actually built,
// and the history job is the one workflow that writes a branch. Both are publishing
// concerns: a release that misses a platform and a run that pushes from a pull request.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const STAGE_SCRIPT = fileURLToPath(new URL("../../scripts/stage-publish.mjs", import.meta.url));
const PERF = readFileSync(new URL("../../.github/workflows/perf.yml", import.meta.url), "utf8");
const PUBLISH_HISTORY = PERF.split(/\n {2}(?=publish-history:)/)[1] ?? "";

const COMPARE_JOB =
  PERF.split(/\n {2}(?=echo-throughput:)/)[1]?.split(/\n {2}(?=publish-history:)/)[0] ?? "";

const SCOPE = "@ventiws";
const VERSION = "9.9.9";
const BINDING = "binding-";

function expectAll(source: string, needles: readonly string[]): void {
  for (const needle of needles) expect(source).toContain(needle);
}

type PlatformsManifest = { readonly platforms: readonly string[] };

type StagedManifest = {
  readonly version?: string;
  readonly scripts?: Readonly<Record<string, string>>;
  readonly optionalDependencies?: Readonly<Record<string, string>>;
};

const platforms: PlatformsManifest = JSON.parse(
  readFileSync(new URL("../../src/builds/platforms.json", import.meta.url), "utf8"),
);

const TARGETS = platforms.platforms;

/// A tree shaped like the publish job assembles it: the scaffolded manifest, one directory
/// per built platform, and the bundle `tsdown` produced. `built` is how a failed shard looks.
function scaffold(built: readonly string[] = TARGETS): string {
  const root = mkdtempSync(join(tmpdir(), "ventiws-stage-"));
  const stage = join(root, "npm", "ventiws");
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "ventiws", version: VERSION, scripts: { build: "x" } }),
  );
  mkdirSync(join(root, "dist"), { recursive: true });
  writeFileSync(join(root, "dist", "index.mjs"), "export {};\n");
  // npm force-includes these from the packed directory, so the stage copies them.
  writeFileSync(join(root, "README.md"), "# ventiws\n");
  writeFileSync(join(root, "LICENSE"), "MIT\n");
  mkdirSync(join(stage, SCOPE), { recursive: true });
  // A shard's scaffold names only its own platform; the gate must not learn the set here.
  writeFileSync(join(stage, "package.json"), JSON.stringify({ name: "ventiws" }));

  for (const target of built) {
    const dir = join(stage, SCOPE, `${BINDING}${target}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "package.json"), "{}");
    writeFileSync(join(dir, "ventiws.node"), "not a real addon");
  }

  return root;
}

function runStage(root: string) {
  const result = spawnSync(process.execPath, [STAGE_SCRIPT], { cwd: root, stdio: "pipe" });

  return { code: result.status ?? 1, out: `${result.stdout}${result.stderr}` };
}

function stagedManifest(root: string): StagedManifest {
  const manifest: StagedManifest = JSON.parse(
    readFileSync(join(root, "npm", "ventiws", "package.json"), "utf8"),
  );

  return manifest;
}

test("a complete tree stages every platform and drops what npm must not carry", () => {
  const root = scaffold();
  expect(runStage(root).code).toBe(0);
  const manifest = stagedManifest(root);
  expect(manifest.version).toBe(VERSION);
  expect(manifest.optionalDependencies?.[`${SCOPE}/${BINDING}${TARGETS[0]}`]).toBe(VERSION);
  expect(Object.keys(manifest.optionalDependencies ?? {})).toHaveLength(TARGETS.length);
  expect(manifest.scripts).toBeUndefined();

  for (const file of ["binding.js", "index.js"])
    expect(existsSync(join(root, "npm", "ventiws", file))).toBe(false);

  for (const file of ["dist/index.mjs", "README.md", "LICENSE"])
    expect(existsSync(join(root, "npm", "ventiws", file))).toBe(true);
});

const FAILURES: ReadonlyArray<readonly [string, readonly string[], readonly string[]]> = [
  [
    "a failed shard stops the release",
    TARGETS.slice(0, -1),
    [`binding-${TARGETS.at(-1)}`, "declared but not built"],
  ],
  ["a platform nobody declared is refused", [...TARGETS, "win32-x64"], ["win32-x64"]],
];

test.each(FAILURES)("%s", (_name, built, needles) => {
  const result = runStage(scaffold(built));
  expect(result.code).not.toBe(0);

  for (const needle of needles) expect(result.out).toContain(needle);
});

test("a directory whose compile produced no addon is refused", () => {
  const root = scaffold();
  rmSync(join(root, "npm", "ventiws", SCOPE, `${BINDING}${TARGETS[0]}`, "ventiws.node"));
  const result = runStage(root);
  expect(result.code).not.toBe(0);
  expect(result.out).toContain("ventiws.node");
});

test("only the trusted history job receives write permission and publishes as the bot", () => {
  expect(PERF).toMatch(/permissions:\n {2}contents: read/);
  expect(PUBLISH_HISTORY).toMatch(/permissions:\n {6}contents: write/);
  expect(COMPARE_JOB).not.toContain("contents: write");
  expectAll(PUBLISH_HISTORY, [
    "github.event_name != 'pull_request'",
    "refs/heads/main",
    "github-actions[bot]",
    "41898282+github-actions[bot]@users.noreply.github.com",
    "git -C history push origin HEAD:benchmark-data",
  ]);

  for (const path of [
    "bench/contracts/echo_throughput_v2.env",
    "bench/contracts/echo_throughput_v2.schema.json",
    "bench/contracts/CONTRACT-v2.md",
    "scripts/publish-bench-history.mjs",
  ]) {
    expect(existsSync(new URL(path, new URL("../../", import.meta.url)))).toBe(true);
    expect(PERF).toContain(path);
  }

  expectAll(PERF, ["name: echo-throughput", "schedule:", "cron:", "run: pnpm run bench"]);
  expect(PERF).not.toMatch(/pnpm run bench --gate/);
});
