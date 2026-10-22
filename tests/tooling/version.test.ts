// The version is stated in three files that cannot import each other. Every bug in this
// area is the same shape: one fact stated twice, one of them stale.

import { expect, test } from "vitest";
import { compareVersions } from "../../scripts/next-version.mjs";
import { CHANGELOG, MANIFEST, README, ZON } from "./version-fixtures";

/// The version in a `## [...]` heading, so the changelog is read as a log rather than text.
const HEADING = /^## \[([^\]]+)\]/gm;

function logged(): string[] {
  return [...CHANGELOG.matchAll(HEADING)].map((match) => match[1] ?? "");
}

/// Adjacent pairs, newest first: `[a, b]` names the direction, where `toEqual` does not.
function descending(values: readonly string[]): [string, string][] {
  return values.slice(1).map((value, index) => [values[index] ?? "", value]);
}

test("the three sources of the version agree with the manifest", () => {
  expect(/\.version\s*=\s*"([^"]+)"/.exec(ZON)?.[1]).toBe(MANIFEST.version);
  expect(/is at\s*`([^`]+)`/.exec(README)?.[1]).toBe(MANIFEST.version);
});

test("the changelog is a log: newest first, and never ahead of the manifest", () => {
  const entries = logged();
  expect(entries.length).toBeGreaterThan(0);

  // The newest heading may lag the version, because a merge with no changelog type still
  // bumps it. What must not happen is a heading ahead of the manifest.
  expect(compareVersions(entries[0] ?? "", MANIFEST.version)).toBeLessThanOrEqual(0);

  for (const [newer, older] of descending(entries))
    expect(compareVersions(older, newer)).toBeLessThanOrEqual(0);
});
