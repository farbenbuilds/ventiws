// `bump.yml` advances the version on a merge, commits it, and pushes the tag. Every
// assertion here is about the one fact that makes the next release happen: the workflow
// and the scripts it calls have to agree on the marker, the credential, and the tag.

import { expect, test } from "vitest";
import { BUMP_SCRIPT, BUMP_WORKFLOW, MANIFEST, MARKERS, TAG_SCRIPT } from "./version-fixtures";

test("the loop guard matches the commit the bump makes", () => {
  // The guard reads the head commit's subject and the bump writes one, so a marker that
  // differs between them is an infinite bump rather than a visible failure.
  const marker = /const MARKER = "([^"]+)"/.exec(BUMP_SCRIPT)?.[1];
  expect(marker).toBeDefined();
  expect(BUMP_WORKFLOW).toContain(`!startsWith(github.event.head_commit.message, '${marker}')`);
  expect(BUMP_WORKFLOW).toContain(`git commit -m "${marker} v$VERSION"`);
  expect(BUMP_WORKFLOW).toContain("VERSION: ${{ steps.bump.outputs.version }}");
});

test("the commit the tag points at carries no CI skip marker", () => {
  // GitHub reads a marker anywhere in a *tagged* commit's message, so one here would skip
  // `publish.yml`: a tag on `main`, nothing on npm, and no workflow to report it.
  const commit = /git commit -m "([^"]*)"/.exec(BUMP_WORKFLOW)?.[1] ?? "";
  expect(commit).not.toBe("");

  for (const marker of MARKERS) expect(commit.includes(`[${marker}]`), commit).toBe(false);
});

test("the merge's release directive reaches the bump as labels or inputs", () => {
  // A push run has no inputs, so the directive is the merged pull request's labels; a
  // dispatch run has no pull request, so it is the inputs. Both end at one kinds string.
  expect(BUMP_WORKFLOW).toContain("pull-requests: read");
  expect(BUMP_WORKFLOW).toContain("/commits/${{ github.sha }}/pulls");
  expect(BUMP_WORKFLOW).toContain('node scripts/bump-version.mjs --release "${KINDS}"');
  expect(BUMP_WORKFLOW).toContain("inputs.preid");
});

test("a release:skip label lands the merge with nothing written", () => {
  // Every step that mints a credential or writes a version, commit, or tag gates on `skip`.
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

test("the bump tags through the release app, the one credential that starts a run", () => {
  // `publish.yml` takes no dispatch, and a tag pushed with `GITHUB_TOKEN` starts no run, so
  // the tag is pushed with an installation token; the bump commit itself stays silent.
  expect(BUMP_WORKFLOW).toContain("actions/create-github-app-token@v3");
  expect(BUMP_WORKFLOW).toContain("secrets.RELEASE_APP_PRIVATE_KEY");
  expect(BUMP_WORKFLOW).toContain('git push "$remote" "refs/tags/$TAG"');
  expect(BUMP_WORKFLOW).not.toContain("gh workflow run");
  expect(BUMP_WORKFLOW).not.toContain("id-token");
});

test("the checkout holds no credential that could authenticate the tag push", () => {
  // actions/checkout otherwise persists a `GITHUB_TOKEN` Authorization header, which took
  // precedence over the app token and made alpha.11's tag push a silent `GITHUB_TOKEN`
  // push: the tag reached the remote with no publish run behind it.
  expect(BUMP_WORKFLOW).toContain("persist-credentials: false");
  expect(BUMP_WORKFLOW).toContain("BRANCH_TOKEN");
});

test("a re-run finds its own commit and an existing tag rather than bumping twice", () => {
  // A lost tag push is recovered by re-running: the version is already committed, and the
  // tag is pushed only when the remote does not have it.
  expect(BUMP_WORKFLOW).toContain("is already committed");
  expect(BUMP_WORKFLOW).toContain('git ls-remote --tags "$remote" "refs/tags/$TAG"');
  expect(BUMP_WORKFLOW).toContain('echo "$TAG already exists"');
});

test("the bump keeps the history and tags its version rule reads", () => {
  // `bump-version` finds the previous bump commit through `git log`, so a depth-1 checkout
  // writes no changelog section at all; it also treats an untagged version as unpublished,
  // so a checkout without tags would silently publish nothing for a merge.
  expect(BUMP_WORKFLOW).toContain("fetch-depth: 0");
  expect(BUMP_WORKFLOW).toContain("fetch-tags: true");
});

test("a release pushes the tag itself, not only what --follow-tags carries", () => {
  // `--follow-tags` carries annotated tags; this release tag is lightweight on a branch
  // that is already up to date, which is exactly the tag it leaves behind.
  expect(TAG_SCRIPT).toContain('push(["push", "origin", branch,');
  expect(TAG_SCRIPT).toContain("refs/tags/${tag}`]);");
  expect(TAG_SCRIPT).not.toMatch(/"--follow-tags"/);
});

test("a release tags the version it finds rather than choosing one", () => {
  // `bumpp` commits, tags, and pushes in one step, so leaving it on the release path would
  // move the version at tag time and leave the tag behind the manifest, which is what
  // `check-release-tag.mjs` refuses to publish.
  expect(MANIFEST.scripts.release).toBe("node scripts/tag-release.mjs");
  expect(Object.values(MANIFEST.scripts)).not.toContain("bumpp");
});
