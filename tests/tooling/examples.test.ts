// The runtime examples deliberately differ: each keeps the same ventiws server but reads its
// host's environment API and dials with its host's client, so a shared `index.ts` would undo
// the teaching. The Effect RPC example is a multi-file project held to the manifest rules.

import { readFileSync } from "node:fs";
import { SOURCES } from "../../scripts/version-sources.mjs";
import { expect, test } from "vitest";

const ROOT = new URL("../../", import.meta.url);
const EXAMPLES = ["vanilla", "bun", "deno", "effect-rpc", "express-session"];

type Manifest = {
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
};

const read = (path: string) => readFileSync(new URL(path, ROOT), "utf8");
const example = (runtime: string, file: string) => read(`examples/${runtime}-ventiws/${file}`);
const manifest = (runtime: string) => JSON.parse(example(runtime, "package.json")) as Manifest;

/// The version the repository states; every example pins this exact release.
const VERSION = (JSON.parse(read("package.json")) as { readonly version: string }).version;

test("each runtime example names its own host API", () => {
  expect(example("vanilla", "index.ts")).toContain("process.env");
  expect(example("bun", "index.ts")).toContain("Bun.env");
  expect(example("deno", "index.ts")).toContain("Deno.env.get");
  expect(example("deno", "index.ts")).toContain("Deno.exitCode");
});

test("only the Node example dials with the ventiws client", () => {
  expect(example("vanilla", "index.ts")).toContain("{ WebSocket, WebSocketServer }");
  expect(example("bun", "index.ts")).toContain("{ WebSocketServer }");
  expect(example("deno", "index.ts")).toContain("{ WebSocketServer }");
});

test("every example pins the released ventiws, not the workspace", () => {
  // `workspace:`, `file:`, and `link:` specifiers would bind the examples to the checkout
  // instead of the published package the standalone-project claim rests on. The exact
  // version is what the release shipped; `latest` would let an install drift under the
  // example as soon as the dist-tag moves.
  for (const runtime of EXAMPLES) {
    expect(manifest(runtime).dependencies?.ventiws, runtime).toBe(VERSION);
  }
});

test("the release bump advances and stages the example pins", () => {
  // The pins state the same version as `package.json`, so a bump that wrote one and not the
  // others would leave the examples behind. The sources carry every manifest and the
  // workflow stages the directory they live in.
  const paths = SOURCES.map((source) => source.path);
  for (const runtime of EXAMPLES) {
    expect(paths, runtime).toContain(`examples/${runtime}-ventiws/package.json`);
  }
  expect(read(".github/workflows/bump.yml")).toContain("examples/*/package.json");
});

test("only the Node examples declare @types/node", () => {
  // Bun and Deno type their own APIs; a direct @types/node there would pin a second
  // Node surface beside the runtime's.
  const carriers = EXAMPLES.filter(
    (runtime) => manifest(runtime).devDependencies?.["@types/node"] !== undefined,
  );
  expect(carriers).toEqual(["vanilla", "effect-rpc", "express-session"]);
});

test("the framework examples name their runtimes", () => {
  expect(manifest("effect-rpc").dependencies?.effect).toBeDefined();
  expect(manifest("express-session").dependencies?.express).toBeDefined();
});

test("the Express example attaches through the HTTP upgrade", () => {
  expect(example("express-session", "index.ts")).toContain("noServer: true");
  expect(example("express-session", "index.ts")).toContain("handleUpgrade");
});
