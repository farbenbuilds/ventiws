#!/usr/bin/env node
// Advances the version in the three files that state it, by a release directive.
//
// The directive is `release:<kind>` labels on the merge's pull request, or the `bump.yml`
// dispatch inputs; with none, a prerelease advances its counter and a stable version starts
// the next patch's train on `alpha.0`. An untagged tree version is the release as written
// (`scripts/next-version.mjs` owns the table; `tests/tooling/version.test.ts` holds it).
//
// The three files cannot import each other -- a manifest, a Zig build manifest, and a
// document -- so each is rewritten from the version already in `package.json`, and a
// disagreement is reported rather than overwritten. Writing the truth over a drifted file
// hides the drift instead of failing on it, which is the shape of every bug this pipeline
// has already had: the same fact stated in two places, one of them stale.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { releaseVersion } from "./next-version.mjs";
import { changelogSection, git } from "./changelog-section.mjs";

const PACKAGE = "package.json";
const CHANGELOG = "CHANGELOG.md";
const MARKER = "chore(release):";

/// This repository, from the script's own location rather than the working directory.
///
/// Resolved against `process.cwd()`, a run from anywhere else edits whatever `package.json`
/// it finds there: a subdirectory rewrites nothing useful, and a directory with an
/// unrelated manifest gets a version and a changelog section written into it.
const ROOT = fileURLToPath(new URL("..", import.meta.url));

/// The version sits between a prefix and a suffix in each source, captured so a rewrite
/// touches the digits alone. Matched as text because two of the three are not JSON.
const SOURCES = [
  { path: PACKAGE, pattern: /("version":\s*")([^"]+)(")/ },
  { path: "build.zig.zon", pattern: /(\.version\s*=\s*")([^"]+)(")/ },
  { path: "README.md", pattern: /(is at\s*`)([^`]+)(`)/ },
];

const read = (path) => readFileSync(join(ROOT, path), "utf8");
const write = (path, text) => writeFileSync(join(ROOT, path), text);

/// What a source states, or null when it states none. Null fails rather than skips: a
/// renamed key would otherwise leave the file unrewritten and publish the old version.
function stated(source) {
  const match = read(source.path).match(source.pattern);

  return match ? match[2] : null;
}

/// The release directive: `--release major,beta`, `--release=beta`, or bare kinds.
///
/// Unknown kinds fail in `nextVersion`, which owns the table, so the CLI and the workflow
/// cannot disagree about what a directive means.
function releaseKinds(args) {
  return args
    .flatMap((arg) => arg.replace(/^--release(=|$)/, "").split(","))
    .filter((kind) => kind !== "");
}

function main() {
  const current = JSON.parse(read(PACKAGE)).version;
  const drifted = SOURCES.filter((source) => stated(source) !== current);

  for (const source of drifted) {
    process.stderr.write(
      `bump-version: ${source.path} states ${stated(source)}, ${PACKAGE} states ${current}\n`,
    );
  }

  if (drifted.length > 0)
    throw new Error(`bump-version: ${drifted.length} sources disagree with ${PACKAGE}`);

  const shipped = (git(ROOT, ["tag", "--list", `v${current}`]) ?? "").trim() !== "";
  const next = releaseVersion(current, releaseKinds(process.argv.slice(2)), shipped);

  for (const source of SOURCES)
    write(source.path, read(source.path).replace(source.pattern, `$1${next}$3`));

  // Inserted above the first released heading, so the preamble stays the preamble. A
  // merge that reached no changelog type still gets a version and leaves no section: an
  // empty heading would read as a release that changed nothing.
  const changelog = read(CHANGELOG);
  const first = changelog.search(/^## \[/m);

  if (first === -1) throw new Error(`bump-version: ${CHANGELOG} has no released heading`);
  const section = changelogSection(ROOT, next, MARKER);

  if (section !== null)
    write(CHANGELOG, changelog.slice(0, first) + section + changelog.slice(first));

  console.log(`bump-version: ${current} -> ${next}`);
}

main();
