// Two comment-budget ways to be wrong: flag a file that is fine, or miss one that is not.
// The commit hook is the other gate: a squash marker is a push GitHub reads as "run nothing".

import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { commentViolations } from "../../scripts/comment-budget.mjs";

function violationsOf(source: string, name = "sample.ts"): string[] {
  const violations: string[] = [];
  commentViolations(name, source, violations);

  return violations;
}

/// `code` code lines, each preceded by a burst of `per` comment lines. Bursts stay under
/// the run cap so a test can exercise the ratio without also tripping the run check.
function burst(code: number, per: number): string {
  const lines: string[] = [];

  for (let i = 0; i < code; i += 1) {
    for (let c = 0; c < per; c += 1) lines.push(`// why ${i}.${c}`);
    lines.push(`const v${i} = ${i};`);
  }

  return lines.join("\n");
}

const repeat = (count: number, line: (index: number) => string): string[] =>
  Array.from({ length: count }, (_, index) => line(index));

test("a clean file is not flagged, but Zig's //! doc is", () => {
  expect(violationsOf(burst(60, 0))).toEqual([]);
  expect(violationsOf(`// one reason.\n${burst(60, 0)}`)).toEqual([]);
  const pairs = repeat(12, (i) => `// c${i}\nconst v${i} = ${i};`).join("\n");
  expect(violationsOf(`${pairs}\n${burst(48, 0)}`)).toEqual([]);
  expect(violationsOf(`//! module essay\n${burst(60, 0)}`)[0]).toContain("//!");
});

test("a run and a uniform comment density are each capped", () => {
  const source = [...repeat(12, (i) => `// ${i}`), ...repeat(40, (i) => `const v${i} = ${i};`)];
  const run = violationsOf(source.join("\n"));
  const ratio = violationsOf(burst(60, 1));
  expect(run).toHaveLength(1);
  expect(run[0]).toContain("consecutive comment lines");
  expect(ratio).toHaveLength(1);
  expect(ratio[0]).toContain("comment lines for");
});

test("a small file is capped in absolute terms but still gets a module doc", () => {
  // Nine code lines and 18 comment lines is a ratio of 2.0, which a module of
  // declarations cannot avoid, so a band judges it: the floor is a module doc.
  expect(violationsOf(burst(9, 0))).toEqual([]);
  expect(violationsOf(burst(9, 1))[0]).toContain("-code-line file exceeds");
  expect(violationsOf(burst(9, 2))[0]).toContain("-code-line file exceeds");
  expect(
    violationsOf([...repeat(5, (i) => `// ${i}`), "const a = 1;", "const b = 2;"].join("\n")),
  ).toEqual([]);
});

test("a Zig capacity table is judged by shape, not by ratio", () => {
  const table = repeat(7, (i) => `/// capacity ${i} and why\npub const c${i} = ${i};`).join("\n");
  expect(violationsOf(table, "capacities.zig")).toEqual([]);
  expect(violationsOf("/// one\npub const a = 1;", "capacities.zig")).toEqual([]);

  const mixed = [
    "/// why",
    "pub const a = 1;",
    "/// what it does",
    "pub fn f() void {}",
    ...repeat(6, (i) => `/// more ${i}`),
  ].join("\n");

  expect(violationsOf(mixed, "capacities.zig").length).toBeGreaterThan(0);
  expect(violationsOf(table, "table.ts").length).toBeGreaterThan(0);
});

test("a block comment counts as a run and a trailing comment is counted", () => {
  const block = ["/**", ...repeat(12, (i) => ` * line ${i}`), " */", "let a = 1;"].join("\n");
  expect(violationsOf(block).some((v) => v.includes("consecutive comment lines"))).toBe(true);

  const trailing = [
    ...repeat(30, (i) => `const v${i} = ${i}; // index ${i}`),
    ...repeat(40, (i) => `const w${i} = ${i};`),
  ].join("\n");

  expect(violationsOf(trailing).some((v) => v.includes("comment lines for"))).toBe(true);
});

test("a comment marker inside a string is not a comment, and a blank line ends a run", () => {
  const strings = [
    'const GLOB = "tests/autobahn/**";',
    'const URL = "wss://example.invalid/ws";',
    ...repeat(40, (i) => `const v${i} = ${i};`),
  ].join("\n");

  expect(violationsOf(strings)).toEqual([]);

  // Two items each carrying a doc comment are not one module essay, so adjacency is capped.
  const spaced = [
    ...repeat(8, (i) => `// ${i}\n`),
    ...repeat(40, (i) => `const v${i} = ${i};`),
  ].join("\n");

  expect(violationsOf(spaced)).toEqual([]);
});

const COMMIT_SCRIPT = fileURLToPath(new URL("../../scripts/check-commit-msg.mjs", import.meta.url));

function run(message: string) {
  const dir = mkdtempSync(join(tmpdir(), "ventiws-msg-"));
  const file = join(dir, "COMMIT_EDITMSG");
  writeFileSync(
    file,
    `${message}\n# Please enter the commit message for your changes.\n# On branch main\n`,
  );

  const result = spawnSync(process.execPath, [COMMIT_SCRIPT, file], {
    encoding: "utf8",
    stdio: "pipe",
  });

  return { code: result.status ?? 1, out: `${result.stdout}${result.stderr}` };
}

test("a conventional message passes", () => {
  expect(run("fix(compat): a socket state that could not be reached\n\nBody text.").code).toBe(0);
});

const MARKERS = ["skip ci", "ci skip", "no ci", "skip actions", "actions skip"];

test.each(MARKERS)("refuses [%s] in the subject", (marker) => {
  expect(run(`docs: explain [${marker}]\n\nBody.`).code).not.toBe(0);
});

test("refuses a marker in the body or a quoted description, and says how to recover", () => {
  // GitHub matches the literal string anywhere, so a commit that quotes the marker is
  // refused too; the failure is invisible from CI, so the hook explains the recovery.
  expect(
    run("docs: describe the release\n\nThe commit carries [skip ci] because...").code,
  ).not.toBe(0);
  expect(run("docs: a note on [skip ci] markers\n\nThis commit carries none.").code).not.toBe(0);
  expect(run("docs: x\n\n[skip ci]").out).toContain("gh workflow run bump.yml");
});
