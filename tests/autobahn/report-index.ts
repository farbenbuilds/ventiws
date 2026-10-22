/// The report contract is `ws`: a case passes when neither `behavior` nor
/// `behaviorClose` reports a real failure. `NON-STRICT` is tolerated because
/// the suite uses it for "accepted but not ideal" outcomes where the
/// specification is genuinely ambiguous, and because the reference
/// implementation ventiws is measured against reports it for 6.4.1 through
/// 6.4.4. Failing it would fail the baseline the project measures itself
/// against, so the gate and `CI_CD_PIPELINE.md` both treat it as a pass.
import type { JsonValue } from "./json-reading.ts";
import { isJsonRecord, jsonInteger, jsonNumber, jsonString } from "./json-reading.ts";

export const TOLERATED_BEHAVIORS: ReadonlySet<string> = new Set([
  "OK",
  "INFORMATIONAL",
  "NON-STRICT",
]);

export type ToleratedBehavior = "OK" | "INFORMATIONAL" | "NON-STRICT";

export type Outcome = "passed" | "failed" | "skipped-capacity";

export type ReportCase = {
  readonly id: string;
  readonly behavior: string;
  readonly behaviorClose: string;
  readonly durationMs: number;
  readonly remoteCloseCode: number | null;
};

export type CaseReport = {
  readonly id: string;
  readonly behavior: string;
  readonly behaviorClose: string;
  readonly durationMs: number;
  readonly remoteCloseCode: number | null;
  readonly outcome: Outcome;
};

export function isTolerated(behavior: string): boolean {
  return TOLERATED_BEHAVIORS.has(behavior);
}

/// Classification is a total function of the case id and the two behavior
/// strings, so the same report always produces the same verdicts. Capacity is
/// decided from the case id alone, which keeps a case that both exceeds the
/// frame cap and misbehaves from being reported as a clean skip.
export function classifyCase(report: ReportCase, exceedsLimit: boolean): Outcome {
  if (exceedsLimit) return "skipped-capacity";
  const tolerated = isTolerated(report.behavior) && isTolerated(report.behaviorClose);

  return tolerated ? "passed" : "failed";
}

/// The report is untrusted JSON, so each field is decoded to a named value
/// before it enters `ReportCase`; a missing or mistyped field drops the case.
function readCase(id: string, value: JsonValue): ReportCase | null {
  if (!isJsonRecord(value)) return null;
  const behavior = jsonString(value["behavior"]);

  if (behavior === null) return null;
  const behaviorClose = jsonString(value["behaviorClose"]);

  if (behaviorClose === null) return null;

  return {
    id,
    behavior,
    behaviorClose,
    durationMs: jsonNumber(value["duration"]) ?? 0,
    remoteCloseCode: jsonInteger(value["remoteCloseCode"]),
  };
}

/// The report is nested under the `agent` name from `fuzzingclient.json`, so a
/// renamed agent surfaces here as a typed error instead of an empty pass.
export function parseReportIndex(raw: string, agent: string): readonly ReportCase[] {
  let parsed: JsonValue;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);

    throw new SyntaxError(`autobahn: index.json is not valid JSON: ${detail}`);
  }

  if (!isJsonRecord(parsed)) throw new TypeError("autobahn: index.json must be a JSON object");
  const bucket = parsed[agent];

  if (!isJsonRecord(bucket)) {
    throw new TypeError(`autobahn: index.json has no "${agent}" agent entry`);
  }

  const cases: ReportCase[] = [];

  for (const [id, value] of Object.entries(bucket)) {
    const record = readCase(id, value);

    if (record === null) throw new TypeError(`autobahn: case ${id} has no usable report entry`);
    cases.push(record);
  }

  return cases;
}

export function toCaseReports(
  cases: readonly ReportCase[],
  exceedsLimit: (id: string) => boolean,
): readonly CaseReport[] {
  return cases.map((report) => {
    const outcome = classifyCase(report, exceedsLimit(report.id));

    return {
      id: report.id,
      behavior: report.behavior,
      behaviorClose: report.behaviorClose,
      durationMs: report.durationMs,
      remoteCloseCode: report.remoteCloseCode,
      outcome,
    };
  });
}
