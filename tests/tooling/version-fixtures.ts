import { readFileSync } from "node:fs";

export type Manifest = { readonly version: string; readonly scripts: Record<string, string> };

const ROOT = new URL("../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), "utf8");

export const MANIFEST: Manifest = JSON.parse(read("package.json"));
export const ZON = read("build.zig.zon");
export const README = read("README.md");
export const CHANGELOG = read("CHANGELOG.md");
export const BUMP_SCRIPT = read("scripts/bump-version.mjs");
export const BUMP_WORKFLOW = read(".github/workflows/bump.yml");
export const TAG_SCRIPT = read("scripts/tag-release.mjs");

/// The five forms GitHub recognises, shared with `check-commit-msg.mjs`. A check that knew
/// four works right up until the fifth is used, which is why this is a list.
export const MARKERS = ["skip ci", "ci skip", "no ci", "skip actions", "actions skip"];
