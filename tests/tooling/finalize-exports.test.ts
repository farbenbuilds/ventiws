// `pnpm build` regenerates the exports map from what the bundler produced and then
// completes it here, so the script is the one place the `types` and named-runtime
// conditions can be asserted without racing a build.

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, expect, test } from "vitest";

const SCRIPT = fileURLToPath(new URL("../../scripts/finalize-exports.mjs", import.meta.url));
const created: string[] = [];

afterAll(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
});

type ExportConditions = {
  readonly import?: string;
  readonly require?: string;
  readonly types?: string | Readonly<Record<string, string>>;
  readonly bun?: ExportConditions;
};

type Manifest = {
  readonly types?: string;
  readonly exports?: Readonly<Record<string, ExportConditions>>;
};

type RunResult = { readonly status: number | null; readonly manifest: Manifest };

function manifestPath(fixture: Manifest): string {
  const dir = mkdtempSync(join(tmpdir(), "ventiws-exports-"));
  created.push(dir);
  const path = join(dir, "package.json");
  writeFileSync(path, `${JSON.stringify(fixture, null, 2)}\n`);

  return path;
}

function run(fixture: Manifest): RunResult {
  const path = manifestPath(fixture);
  const result = spawnSync(process.execPath, [SCRIPT, path], { encoding: "utf8" });
  const manifest: Manifest = JSON.parse(readFileSync(path, "utf8"));

  return { status: result.status, manifest };
}

function rerun(path: string): Manifest {
  const result = spawnSync(process.execPath, [SCRIPT, path], { encoding: "utf8" });
  expect(result.status).toBe(0);
  const manifest: Manifest = JSON.parse(readFileSync(path, "utf8"));

  return manifest;
}

test("adds a declaration beside each bundled runtime path", () => {
  const { status, manifest } = run({
    exports: {
      ".": { import: "./dist/index.mjs", require: "./dist/index.cjs" },
      "./logging": { import: "./dist/logging.mjs", require: "./dist/logging.cjs" },
    },
  });

  expect(status).toBe(0);
  const root = manifest.exports?.["."];
  expect(root?.types).toEqual({ import: "./dist/index.d.mts", require: "./dist/index.d.cts" });
  expect(root?.import).toBe("./dist/index.mjs");
  expect(manifest.types).toBe("./dist/index.d.mts");
});

test("names Bun ahead of the format condition", () => {
  const { status, manifest } = run({
    exports: { ".": { import: "./dist/index.mjs", require: "./dist/index.cjs" } },
  });

  expect(status).toBe(0);
  const root = manifest.exports?.["."];
  const keys = Object.keys(root ?? {});
  expect(root?.bun).toEqual({ import: "./dist/index.mjs", require: "./dist/index.cjs" });
  // A resolver stops at the first matching key, so the named runtime has to precede the
  // format condition it falls back to; the value keeps the CJS require shape.
  expect(keys.indexOf("types")).toBeLessThan(keys.indexOf("bun"));
  expect(keys.indexOf("bun")).toBeLessThan(keys.indexOf("import"));
});

test("a completed manifest is stable when it is completed again", () => {
  // The build runs the script on the manifest the previous build wrote, so a second run
  // must not let its own named-runtime values overwrite the nested ones.
  const path = manifestPath({
    exports: { ".": { import: "./dist/index.mjs", require: "./dist/index.cjs" } },
  });

  const once = rerun(path);
  const twice = rerun(path);
  expect(twice.exports?.["."]).toEqual(once.exports?.["."]);
});

test("a subpath with no ESM bundle gets no named-runtime keys", () => {
  const { status, manifest } = run({
    exports: {
      ".": { import: "./dist/index.mjs", require: "./dist/index.cjs" },
      "./legacy": { require: "./dist/legacy.cjs" },
    },
  });

  expect(status).toBe(0);
  const legacy = manifest.exports?.["./legacy"];
  expect(legacy?.types).toEqual({ require: "./dist/legacy.d.cts" });
  expect(legacy?.bun).toBeUndefined();
});

test("refuses a manifest with no exports map", () => {
  const path = manifestPath({});
  const result = spawnSync(process.execPath, [SCRIPT, path], { encoding: "utf8" });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("no exports map");
});
