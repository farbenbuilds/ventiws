// The version is stated in three files that cannot import each other, and the release notes
// are the changelog sections between two tags. Both are facts stated twice, held together here.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { compareVersions, nextVersion, releaseVersion } from "../../scripts/next-version.mjs";
import { CHANGELOG, MANIFEST, README, ZON } from "./version-fixtures";

const HEADING = /^## \[([^\]]+)\]/gm;

test("the three sources agree and the changelog is newest first, never ahead", () => {
  expect(/\.version\s*=\s*"([^"]+)"/.exec(ZON)?.[1]).toBe(MANIFEST.version);
  expect(/is at\s*`([^`]+)`/.exec(README)?.[1]).toBe(MANIFEST.version);
  const entries = [...CHANGELOG.matchAll(HEADING)].map((match) => match[1] ?? "");
  expect(entries.length).toBeGreaterThan(0);
  // A merge with no changelog type still bumps the version, so the newest heading may lag
  // it; one ahead of the manifest would advertise a release that does not exist.
  expect(compareVersions(entries[0] ?? "", MANIFEST.version)).toBeLessThanOrEqual(0);

  for (let index = 1; index < entries.length; index += 1)
    expect(compareVersions(entries[index] ?? "", entries[index - 1] ?? "")).toBeLessThanOrEqual(0);
});

const TRANSITIONS: ReadonlyArray<readonly [string, readonly string[], string]> = [
  ["1.0.0-alpha.12", [], "1.0.0-alpha.13"],
  ["1.0.0-alpha.12", ["beta"], "1.0.0-beta.0"],
  ["1.0.0-alpha", [], "1.0.0-alpha.1"],
  ["1.0.0-beta.3", ["beta"], "1.0.0-beta.4"],
  ["1.0.0-beta.3", ["stable"], "1.0.0"],
  ["2.0.0-rc.1", [], "2.0.0-rc.2"],
  ["1.0.0", [], "1.0.1-alpha.0"],
  ["1.0.0", ["beta"], "1.0.1-beta.0"],
  ["1.0.0", ["patch"], "1.0.1"],
  ["1.0.0", ["minor"], "1.1.0"],
  ["1.0.0", ["major"], "2.0.0"],
  ["1.0.0", ["major", "beta"], "2.0.0-beta.0"],
  ["1.0.1-alpha.2", ["major"], "2.0.0-alpha.0"],
  ["1.0.1-alpha.2", ["minor", "stable"], "1.1.0"],
];

test.each(TRANSITIONS)("%s with %j advances to %s", (current, kinds, expected) => {
  expect(nextVersion(current, kinds)).toBe(expected);
});

const REFUSALS: ReadonlyArray<readonly [string, readonly string[], string]> = [
  ["1.0.0", ["stable"], "already stable"],
  ["1.0.0", ["major", "minor"], "cannot combine"],
  ["1.0.0", ["alpha", "beta"], "cannot combine"],
  ["1.0.0", ["nope"], "unknown release kind"],
];

test.each(REFUSALS)("refuses %s with %j: %s", (current, kinds, message) => {
  expect(() => nextVersion(current, kinds)).toThrow(message);
});

// An authored prerelease is released as written until it has a tag.
const RELEASES: ReadonlyArray<readonly [string, readonly string[], boolean, string]> = [
  ["1.0.0-beta", [], false, "1.0.0-beta"],
  ["1.0.0-beta", ["beta"], false, "1.0.0-beta"],
  ["1.0.0-rc", ["rc"], false, "1.0.0-rc"],
  ["1.0.0", [], false, "1.0.0"],
  ["2.0.0", [], false, "2.0.0"],
  ["1.0.0-beta", [], true, "1.0.0-beta.1"],
  ["1.0.0-beta", ["stable"], true, "1.0.0"],
  ["1.0.0", ["major"], true, "2.0.0"],
  ["1.0.0", ["minor", "beta"], true, "1.1.0-beta.0"],
];

test.each(RELEASES)("releases %s with %j tagged=%s as %s", (current, kinds, tagged, expected) => {
  expect(releaseVersion(current, kinds, tagged)).toBe(expected);
});

const NEWER: ReadonlyArray<readonly [string, string]> = [
  ["1.0.1-alpha.2", "1.0.1-alpha.1"],
  ["1.0.1-alpha.1", "1.0.1-alpha"],
  ["1.0.1-beta.0", "1.0.1-alpha.9"],
  ["1.0.1", "1.0.1-rc.4"],
  ["2.0.0-rc.0", "1.9.9"],
];

test.each(NEWER)("%s is newer than %s", (newer, older) => {
  expect(compareVersions(newer, older)).toBeGreaterThan(0);
  expect(compareVersions(older, newer)).toBeLessThan(0);
});

const SCRIPT = fileURLToPath(new URL("../../scripts/release-notes.mjs", import.meta.url));
const PREAMBLE = "# Changelog\n\nAll notable changes.\n\n";

/// A repository with one commit per merge, tagged for the first `tagged` of them: the
/// shape the bump and tag scripts produce together, where newer merges stay untagged.
function repo(versions: readonly string[], tagged: number): string {
  const root = mkdtempSync(join(tmpdir(), "ventiws-notes-"));

  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], {
      cwd: root,
      stdio: "pipe",
    });

  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "ventiws", version: "x" }));
  writeFileSync(join(root, "CHANGELOG.md"), PREAMBLE);
  git("init", "-q");

  for (const [index, version] of versions.entries()) {
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "ventiws", version }));
    const existing = readFileSync(join(root, "CHANGELOG.md"), "utf8");
    const section = `## [${version}] - 2026-09-29\n\n### Added\n\n- work ${index + 1}\n\n`;
    writeFileSync(join(root, "CHANGELOG.md"), PREAMBLE + section + existing.slice(PREAMBLE.length));
    git("add", "-A");
    git("commit", "-q", "-m", `chore(release): v${version}`);

    if (index < tagged) git("tag", `v${version}`);
  }

  return root;
}

function notes(root: string) {
  const out = join(root, "notes.md");
  execFileSync(process.execPath, [SCRIPT, out], { cwd: root, stdio: "pipe" });
  const text = readFileSync(out, "utf8");

  return { text, versions: [...text.matchAll(HEADING)].map((match) => match[1] ?? "") };
}

test("the notes quote the changelog and take only the sections above the previous tag", () => {
  // Reassembling the section loses the date in the heading and the prose a maintainer
  // wrote; the release page is the one place a reader sees the record outside the repo.
  const result = notes(repo(["1.0.0-alpha.1", "1.0.0-alpha.2"], 1));
  expect(result.text).toContain("## [1.0.0-alpha.2] - 2026-09-29");
  expect(result.text).not.toContain("## 1.0.0-alpha.2\n");
  expect(result.text).toContain("## [1.0.0-alpha.2] - 2026-09-29\n\n### Added");
  expect(result.versions).toEqual(["1.0.0-alpha.2"]);
  expect(result.text).toContain("- work 2");
  expect(result.text).not.toContain("- work 1");

  const several = notes(
    repo(["1.0.0-alpha.1", "1.0.0-alpha.2", "1.0.0-alpha.3", "1.0.0-alpha.4"], 1),
  );

  expect(several.versions).toEqual(["1.0.0-alpha.4", "1.0.0-alpha.3", "1.0.0-alpha.2"]);
  // No earlier tag, so `git describe` exits non-zero: that is the answer, not a failure.
  expect(notes(repo(["1.0.0-alpha.1"], 0)).versions).toEqual(["1.0.0-alpha.1"]);
});
