// A sharded run is evidence only if the union is the selection: an overlap must surface as
// a count violation, a silent shard must name its exit code, and the weight table must add up.

import { describe, expect, it } from "vitest";
import weights from "../autobahn/shard-weights.json" with { type: "json" };
import { COMPRESSION_CASES, MODE_COUNTS, TOTAL_CASES } from "../autobahn/expected-cases.ts";
import { evaluateGate } from "../autobahn/gate.ts";
import { maxShardsFor, planShards } from "../autobahn/shard-plan.ts";
import type { Weights } from "../autobahn/shard-plan.ts";
import { duplicateCaseIds, silentShards, unionCases } from "../autobahn/shard-reports.ts";
import type { ShardResult } from "../autobahn/shard-reports.ts";
import type { CaseReport } from "../autobahn/report-index.ts";
import { describeShardFailure } from "../autobahn/suite-execution.ts";
import { measuredSeconds } from "../autobahn/summary.ts";

function caseReport(
  id: string,
  durationMs = 0,
  outcome: CaseReport["outcome"] = "passed",
): CaseReport {
  return { id, behavior: "OK", behaviorClose: "OK", durationMs, remoteCloseCode: 1000, outcome };
}

/// Synthesises the case ids a plan covers, so the union can be checked against the gate's
/// count contract without a suite run.
function casesForGroups(groups: readonly string[], perGroup: number): readonly CaseReport[] {
  const cases: CaseReport[] = [];

  for (const group of groups)
    for (let index = 1; index <= perGroup; index += 1)
      cases.push(caseReport(`${group}.${index}.1`));

  return cases;
}

function shardResult(shardId: number, cases: readonly CaseReport[], code = 0): ShardResult {
  return { shard: planShards(4, "framing")[shardId], code, cases };
}

const PLAN = planShards(4, "framing");
const TABLE: Weights = weights;

describe("the shard union and its failures", () => {
  it("concatenates without deduplicating, names silent shards, and passes a clean partition", () => {
    const shared = [caseReport("6.1.1")];

    const overlap = [
      { shard: PLAN[0], code: 0, cases: shared },
      { shard: PLAN[0], code: 0, cases: shared },
    ];

    const partial = [shardResult(0, [caseReport("1.1.1")]), shardResult(1, []), shardResult(2, [])];
    expect(unionCases(overlap)).toHaveLength(2);
    expect(duplicateCaseIds(overlap)).toEqual(["6.1.1"]);
    expect(unionCases(partial)).toHaveLength(1);
    expect(silentShards(partial)).toEqual([1, 2]);
    expect(silentShards([0, 1, 2, 3].map((id) => shardResult(id, [])))).toEqual([0, 1, 2, 3]);

    const complete = PLAN.map((shard) => ({
      shard,
      code: 0,
      cases: casesForGroups(shard.groups, 2),
    }));

    expect(duplicateCaseIds(complete)).toEqual([]);
    expect(silentShards(complete)).toEqual([]);
    expect(unionCases(complete)).toHaveLength(MODE_COUNTS.framing.groups.length * 2);
  });

  const failures: ReadonlyArray<readonly [string, readonly ShardResult[], string | null]> = [
    [
      "names the exit code a silent shard was killed with",
      [shardResult(0, [caseReport("1.1.1")]), shardResult(2, [], 137)],
      "shards 2 (exit 137) wrote no report; the suite covers fewer cases than its mode selects",
    ],
    [
      "names the exit code of a shard that ran and failed",
      [shardResult(0, [caseReport("1.1.1")], 1)],
      "wstest exited non-zero for shards 0 (exit 1)",
    ],
    ["reports a clean partition as no failure", [shardResult(0, [caseReport("1.1.1")], 0)], null],
  ];

  it.each(failures)("%s", (_name, results, expected) => {
    expect(describeShardFailure(results)).toBe(expected);
  });
});

describe("the gate over a union", () => {
  it("fails a short or empty union on the count and sums durations raw", () => {
    const complete = PLAN.map((shard) => ({
      shard,
      code: 0,
      cases: casesForGroups(shard.groups, 2),
    }));

    const short = evaluateGate(unionCases(complete.slice(0, 3)), "framing");
    const empty = evaluateGate([], "framing");
    expect(short.ok).toBe(false);
    expect(short.violations.map((violation) => violation.kind)).toContain("count-total");
    expect(empty.ok).toBe(false);
    expect(empty.violations.find((entry) => entry.kind === "count-total")?.detail).toContain(
      String(MODE_COUNTS.framing.total),
    );
    expect(measuredSeconds([caseReport("6.1.1", 1500), caseReport("9.1.1", 500)])).toBe(2);
    expect(measuredSeconds([])).toBe(0);
  });
});

describe("the weight table", () => {
  it("pins the measured counts, their totals, and the group-count ceiling", () => {
    expect(TABLE.caseCounts).toEqual({
      "1": 16,
      "2": 11,
      "3": 7,
      "4": 10,
      "5": 20,
      "6": 145,
      "7": 37,
      "9": 54,
      "10": 1,
      "12": 90,
      "13": 126,
    });
    expect(TABLE.caseCounts["12"] + TABLE.caseCounts["13"]).toBe(COMPRESSION_CASES);
    expect(Object.values(TABLE.caseCounts).reduce((total, count) => total + count, 0)).toBe(
      TOTAL_CASES,
    );

    for (const group of Object.keys(TABLE.caseCounts))
      expect(TABLE.groups[group]).toBeGreaterThan(0);

    for (const mode of ["framing", "full"] as const) {
      const plan = planShards(4, mode);
      const widest = planShards(maxShardsFor(mode), mode);

      expect(plan.flatMap((shard) => [...shard.groups]).sort()).toEqual(
        [...MODE_COUNTS[mode].groups].sort(),
      );

      for (const shard of plan) expect(shard.costSeconds).toBeGreaterThan(0);
      expect(maxShardsFor(mode)).toBe(MODE_COUNTS[mode].groups.length);
      expect(widest.flatMap((shard) => [...shard.groups]).sort()).toEqual(
        [...MODE_COUNTS[mode].groups].sort(),
      );

      for (const shard of widest) expect(shard.groups).toHaveLength(1);
    }
  });
});
