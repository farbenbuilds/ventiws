// The release pipeline is a chain of hand-offs between a maintainer's tag and the
// registry, and every link is a string in a YAML file rather than a call a compiler sees.
// The recurring bug is a fact stated twice, one copy not in effect: a page for an
// unpublished version, a second trigger nothing uses, or a prerelease that reads as stable.

import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { BUMP_SCRIPT, BUMP_WORKFLOW, MANIFEST, MARKERS, TAG_SCRIPT } from "./version-fixtures";

const WORKFLOW = readFileSync(
  new URL("../../.github/workflows/publish.yml", import.meta.url),
  "utf8",
);

// Slice the jobs so an assertion about one cannot be satisfied by another above it.
const PUBLISH_JOB = WORKFLOW.slice(
  WORKFLOW.indexOf("\n  publish:"),
  WORKFLOW.indexOf("\n  release:"),
);

const RELEASE_JOB = WORKFLOW.slice(WORKFLOW.indexOf("\n  release:"));
const RELEASE_HEADER = RELEASE_JOB.slice(0, RELEASE_JOB.indexOf("steps:"));

function expectAll(source: string, needles: readonly string[]): void {
  for (const needle of needles) expect(source).toContain(needle);
}

test("the bump and its loop guard agree, and the tagged commit has no skip marker", () => {
  const marker = /const MARKER = "([^"]+)"/.exec(BUMP_SCRIPT)?.[1];
  expect(marker).toBeDefined();
  expectAll(BUMP_WORKFLOW, [
    `!startsWith(github.event.head_commit.message, '${marker}')`,
    `git commit -m "${marker} v$VERSION"`,
    "VERSION: ${{ steps.bump.outputs.version }}",
  ]);
  // GitHub reads a marker anywhere in a tagged commit's message, so one here would skip
  // `publish.yml` and leave a tag on main with nothing on npm.
  const commit = /git commit -m "([^"]*)"/.exec(BUMP_WORKFLOW)?.[1] ?? "";
  expect(commit).not.toBe("");

  for (const marker of MARKERS) expect(commit.includes(`[${marker}]`), commit).toBe(false);
});

test("a merge's directive reaches the bump, and release:skip writes nothing", () => {
  expectAll(BUMP_WORKFLOW, [
    "pull-requests: read",
    "/commits/${{ github.sha }}/pulls",
    'node scripts/bump-version.mjs --release "${KINDS}"',
    "inputs.preid",
  ]);
  expect(BUMP_WORKFLOW).toMatch(/grep\s+-[A-Za-z]*x[A-Za-z]*\s+'release:skip'/);

  for (const header of [
    "- uses: actions/create-github-app-token@v3",
    "- name: Advance the version",
    "- name: Commit the version",
    "- name: Tag the version",
  ]) {
    const start = BUMP_WORKFLOW.indexOf(header);
    const next = BUMP_WORKFLOW.indexOf("\n      - ", start);
    expect(BUMP_WORKFLOW.slice(start, next === -1 ? undefined : next), header).toContain(
      "steps.release.outputs.skip != 'true'",
    );
  }
});

test("the bump tags through the release app, and a re-run finds its own work", () => {
  // A tag pushed with `GITHUB_TOKEN` starts no workflow, so it uses the app token; the
  // checkout must not persist a credential that would take precedence over it.
  expectAll(BUMP_WORKFLOW, [
    "actions/create-github-app-token@v3",
    "secrets.RELEASE_APP_PRIVATE_KEY",
    'git push "$remote" "refs/tags/$TAG"',
    "persist-credentials: false",
    "BRANCH_TOKEN",
    "is already committed",
    'git ls-remote --tags "$remote" "refs/tags/$TAG"',
    'echo "$TAG already exists"',
    "fetch-depth: 0",
    "fetch-tags: true",
  ]);
  expect(BUMP_WORKFLOW).not.toContain("gh workflow run");
  expect(BUMP_WORKFLOW).not.toContain("id-token");
  expect(BUMP_SCRIPT).toContain("const alreadyDocumented = changelog.includes(`## [${next}]`);");
  expect(BUMP_SCRIPT).toContain("if (section !== null && !alreadyDocumented)");
});

test("a release tags the version it finds rather than choosing one", () => {
  // `bumpp` commits, tags, and pushes in one step, so leaving it on the release path
  // would move the version at tag time and leave the tag behind the manifest.
  expect(TAG_SCRIPT).toContain('push(["push", "origin", branch,');
  expect(TAG_SCRIPT).toContain("refs/tags/${tag}`]);");
  expect(TAG_SCRIPT).not.toMatch(/"--follow-tags"/);
  expect(MANIFEST.scripts.release).toBe("node scripts/tag-release.mjs");
  expect(Object.values(MANIFEST.scripts)).not.toContain("bumpp");
});

test("the tag is the only trigger, and the page follows a successful publish", () => {
  const trigger = WORKFLOW.slice(WORKFLOW.indexOf("\non:"), WORKFLOW.indexOf("permissions:"))
    .replace(/^\s*#.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim();

  expect(trigger).toBe('on: push: tags: - "v*"');
  expect(WORKFLOW).not.toContain("inputs.");
  expectAll(RELEASE_HEADER, [
    "needs: [bindings, bindings-musl, publish]",
    "needs.publish.result == 'success'",
    "startsWith(github.ref, 'refs/tags/v')",
  ]);
  expect(RELEASE_HEADER).toMatch(/permissions:\n\s+contents: write/);
  expect(RELEASE_HEADER).not.toContain("id-token");
});

test("OIDC, the npm client, and the six packages sit on the publish job", () => {
  // `pnpm/setup` strips the bundled npm, and a client below 12.2.0 cannot write a
  // dist-tag over OIDC. Both grants belong to the job that publishes, not the page job.
  expect(PUBLISH_JOB).toContain("id-token: write");
  expect(WORKFLOW.slice(0, WORKFLOW.indexOf("\n  publish:"))).not.toContain("id-token");
  expect(RELEASE_JOB).not.toContain("id-token");
  expectAll(PUBLISH_JOB, [
    "pnpm add -g npm@12.2.0",
    "npm --version",
    "actions/download-artifact@v4",
    "node scripts/check-release-tag.mjs",
    "pnpm run stage:publish",
    "pnpm exec napi-zig publish",
    "npm dist-tag add",
    '"ventiws@${TAG#v}" latest',
  ]);
  expect(PUBLISH_JOB).not.toContain("NPM_TOKEN");
});

test("the page names the package and marks a prerelease", () => {
  expectAll(RELEASE_JOB, [
    "PKG: ventiws",
    '--title "$PKG $TAG"',
    'gh release create "$TAG"',
    '[[ "$TAG" == *-* ]]',
    "--prerelease",
  ]);
});
