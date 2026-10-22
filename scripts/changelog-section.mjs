// The changelog section for a version: the merged subjects since the previous bump,
// grouped under the heading each type belongs to. Kept apart from the version files so
// the two responsibilities stay separately readable.

import { execFileSync } from "node:child_process";

/// The subjects that reach the changelog, and the heading each is listed under. A merge is
/// titled by its pull request, and a squash merge keeps that title as its subject.
const REACHING = [
  { pattern: /^feat(\(|!)/, heading: "Added" },
  { pattern: /^fix(\(|!)/, heading: "Fixed" },
  { pattern: /^perf(\(|!)/, heading: "Performance" },
  { pattern: /^(build|ci|refactor|style)(\(|!)/, heading: "Changed" },
];

/// git's stdout, or `null` when git could not answer.
///
/// `null` rather than a throw, because the only question asked of it here is whether a
/// previous bump commit exists, and "no history" is one of the ways the answer is no. A
/// checkout with no commits must bump the version rather than report a git failure.
export const git = (root, args) => {
  try {
    return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
  } catch {
    return null;
  }
};

/// Merged changes since the previous bump, grouped under the heading each type belongs to.
///
/// The boundary is the last bump commit rather than the last tag, because a tag is the
/// release decision and there may be several merges between two of them. Diffing against
/// the tag would reprint every earlier section under each new version.
///
/// No boundary means no section. The first run on a repository has no marker yet, and
/// falling back to all of history would file the project's entire commit log under the
/// next version; a lost marker after a history rewrite would do the same silently. The
/// version still advances either way, because a missing entry is recoverable and a
/// fabricated one is not.
export function changelogSection(root, version, marker) {
  const since = git(root, ["log", `--grep=^${marker}`, "-1", "--format=%H"])?.trim() ?? "";

  if (since === "") {
    process.stderr.write(`bump-version: no earlier ${marker} commit, so no changelog section\n`);

    return null;
  }

  const subjects = (git(root, ["log", "--no-merges", "--format=%s", `${since}..HEAD`]) ?? "")
    .split("\n")
    .filter((subject) => subject !== "");

  const groups = new Map();

  for (const subject of subjects) {
    const entry = REACHING.find(({ pattern }) => pattern.test(subject));

    if (!entry) continue;

    if (!groups.has(entry.heading)) groups.set(entry.heading, []);
    groups.get(entry.heading).push(subject);
  }

  const date = new Date().toISOString().slice(0, 10);

  const body = [...groups].map(
    ([heading, lines]) => `### ${heading}\n\n${lines.map((line) => `- ${line}`).join("\n")}`,
  );

  if (body.length === 0) return null;

  return `## [${version}] - ${date}\n\n${body.join("\n\n")}\n\n`;
}
