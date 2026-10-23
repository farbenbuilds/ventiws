import { expect, test } from "vitest";
import { groupSubjects } from "../../scripts/changelog-section.mjs";

test("unscoped conventional subjects reach the changelog", () => {
  expect(
    groupSubjects(["feat: feature", "fix: bug", "fix(ci): ci", "chore: housekeeping"]),
  ).toEqual([
    ["Added", ["feat: feature"]],
    ["Fixed", ["fix: bug", "fix(ci): ci"]],
  ]);
});
