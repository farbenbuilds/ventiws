// The examples are standalone projects, so their manifests and host APIs are the package
// shape a reader copies. The exports map, the addon size, and the codec/engine split are
// the same claim from the other side: what the published package actually carries.

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, expect, test } from "vitest";

const ROOT = new URL("../../", import.meta.url);
const EXAMPLES = ["vanilla", "bun", "effect-rpc", "express-session"];

type ExampleManifest = {
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
};

const read = (path: string) => readFileSync(new URL(path, ROOT), "utf8");
const example = (runtime: string, file: string) => read(`examples/${runtime}-ventiws/${file}`);
const manifest = (runtime: string): ExampleManifest => JSON.parse(example(runtime, "package.json"));
const CEILINGS = new Map<string, number>([["linux-x64", 600_000]]);

test("each runtime example names its own host API, client, and framework seam", () => {
  expect(example("vanilla", "index.ts")).toContain("process.env");
  expect(example("bun", "index.ts")).toContain("Bun.env");
  expect(example("vanilla", "index.ts")).toContain("{ WebSocket, WebSocketServer }");
  expect(example("bun", "index.ts")).toContain("{ WebSocketServer }");
  expect(example("express-session", "index.ts")).toContain("noServer: true");
  expect(example("express-session", "index.ts")).toContain("handleUpgrade");
});

test("every example resolves ventiws from the registry and the host addon stays bounded", () => {
  // `workspace:`, `file:`, and `link:` specifiers would bind the examples to the checkout
  // instead of the published package the standalone-project claim rests on.
  for (const runtime of EXAMPLES) {
    expect(manifest(runtime).dependencies?.ventiws, runtime).toBe("latest");
  }

  const carriers = EXAMPLES.filter(
    (runtime) => manifest(runtime).devDependencies?.["@types/node"] !== undefined,
  );

  expect(carriers).toEqual(["vanilla", "effect-rpc", "express-session"]);
  expect(manifest("effect-rpc").dependencies?.effect).toBeDefined();
  expect(manifest("express-session").dependencies?.express).toBeDefined();

  const artifact = "zig-out/lib/ventiws.node";

  if (!existsSync(artifact)) return;
  const ceiling = CEILINGS.get(`${process.platform}-${process.arch}`);

  if (ceiling === undefined) return;
  expect(statSync(artifact).size).toBeLessThanOrEqual(ceiling);
});

const FINALIZE = fileURLToPath(new URL("../../scripts/finalize-exports.mjs", import.meta.url));

type ExportConditions = {
  readonly import?: string;
  readonly require?: string;
  readonly types?: string | Readonly<Record<string, string>>;
  readonly bun?: ExportConditions;
};

type ExportManifest = {
  readonly types?: string;
  readonly exports?: Readonly<Record<string, ExportConditions>>;
};

type Spawned = { readonly code: number; readonly out: string; readonly manifest: ExportManifest };

const created: string[] = [];

afterAll(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
});

function manifestPath(fixture: ExportManifest): string {
  const dir = mkdtempSync(join(tmpdir(), "ventiws-exports-"));
  created.push(dir);
  const path = join(dir, "package.json");
  writeFileSync(path, `${JSON.stringify(fixture, null, 2)}\n`);

  return path;
}

function runFinalize(fixture: ExportManifest): Spawned {
  const path = manifestPath(fixture);
  const result = spawnSync(process.execPath, [FINALIZE, path], { encoding: "utf8" });
  const manifest: ExportManifest = JSON.parse(readFileSync(path, "utf8"));

  return { code: result.status ?? 1, out: `${result.stdout}${result.stderr}`, manifest };
}

function rerun(path: string): ExportManifest {
  const result = spawnSync(process.execPath, [FINALIZE, path], { encoding: "utf8" });
  expect(result.status).toBe(0);
  const manifest: ExportManifest = JSON.parse(readFileSync(path, "utf8"));

  return manifest;
}

const ROOT_EXPORT = { import: "./dist/index.mjs", require: "./dist/index.cjs" } as const;

test("adds declarations and names Bun ahead of the format condition", () => {
  const { code, manifest } = runFinalize({
    exports: {
      ".": ROOT_EXPORT,
      "./logging": { import: "./dist/logging.mjs", require: "./dist/logging.cjs" },
    },
  });

  const keys = Object.keys(manifest.exports?.["."] ?? {});
  expect(code).toBe(0);
  expect(manifest.exports?.["."]?.types).toEqual({
    import: "./dist/index.d.mts",
    require: "./dist/index.d.cts",
  });
  expect(manifest.exports?.["."]?.import).toBe("./dist/index.mjs");
  expect(manifest.types).toBe("./dist/index.d.mts");
  expect(manifest.exports?.["."]?.bun).toEqual({
    import: "./dist/index.mjs",
    require: "./dist/index.cjs",
  });
  expect(keys.indexOf("types")).toBeLessThan(keys.indexOf("bun"));
  expect(keys.indexOf("bun")).toBeLessThan(keys.indexOf("import"));
});

test("a completed manifest is stable and an ESM-less subpath gets no Bun keys", () => {
  const path = manifestPath({ exports: { ".": ROOT_EXPORT } });
  const once = rerun(path);
  const twice = rerun(path);
  expect(twice.exports?.["."]).toEqual(once.exports?.["."]);

  const { code, manifest } = runFinalize({
    exports: { ".": ROOT_EXPORT, "./legacy": { require: "./dist/legacy.cjs" } },
  });

  expect(code).toBe(0);
  expect(manifest.exports?.["./legacy"]?.types).toEqual({ require: "./dist/legacy.d.cts" });
  expect(manifest.exports?.["./legacy"]?.bun).toBeUndefined();
});

test("refuses a manifest with no exports map", () => {
  const { code, out } = runFinalize({});
  expect(code).not.toBe(0);
  expect(out).toContain("no exports map");
});
