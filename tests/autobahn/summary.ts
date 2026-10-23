import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { INBOUND_LIMIT_BYTES } from "./expected-cases.ts";
import { MODE_COUNTS } from "./expected-cases.ts";
import type { GateResult } from "./gate.ts";
import type { CaseReport } from "./report-index.ts";
import type { EchoProbe } from "./probe-echo.ts";
import type { Shard } from "./shard-plan.ts";

/// Everything CI needs to upload from a failed run, in one file. The suite's
/// own HTML and JSON reports land next to it under `reports/servers`, but they
/// only exist once `wstest` has run, so this summary is written on every exit
/// path including the ones where the suite never started.
export type AutobahnSummary = {
  /// Which case selection produced this run, so a report says what it covered.
  readonly mode: "framing" | "full";
  readonly ok: boolean;
  readonly agent: string;
  readonly image: string;
  readonly inboundLimitBytes: number;
  readonly expected: {
    readonly total: number;
    readonly capacity: number;
    readonly evaluated: number;
  };
  readonly target: EchoProbe | null;
  readonly suiteRun: boolean;
  /// The partition this run used. One entry per shard, so a report states how
  /// it was split and the expected critical path is visible in the artifact.
  readonly shards: readonly Shard[];
  readonly counts: GateResult["counts"] | null;
  readonly violations: GateResult["violations"];
  readonly cases: readonly CaseReport[];
  readonly failure: string | null;
};

/// Sums the report's own per-case durations, raw: the weights are re-derived from
/// the report, and a rollup here was a second derivation to keep in step.
export function measuredSeconds(cases: readonly CaseReport[]): number {
  return cases.reduce((total, entry) => total + entry.durationMs, 0) / 1000;
}

export function buildSummary(input: {
  readonly ok: boolean;
  readonly mode: "framing" | "full";
  readonly agent: string;
  readonly image: string;
  readonly target: EchoProbe | null;
  readonly suiteRun: boolean;
  readonly gate: GateResult | null;
  readonly cases: readonly CaseReport[];
  readonly shards: readonly Shard[];
  readonly failure: string | null;
}): AutobahnSummary {
  const expected = MODE_COUNTS[input.mode];

  return {
    ok: input.ok,
    mode: input.mode,
    agent: input.agent,
    image: input.image,
    inboundLimitBytes: INBOUND_LIMIT_BYTES,
    expected: {
      total: expected.total,
      capacity: expected.capacity,
      evaluated: expected.evaluated,
    },
    target: input.target,
    suiteRun: input.suiteRun,
    shards: input.shards,
    counts: input.gate?.counts ?? null,
    violations: input.gate?.violations ?? [],
    cases: input.cases,
    failure: input.failure,
  };
}

export function writeSummary(path: string, summary: AutobahnSummary): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
}
