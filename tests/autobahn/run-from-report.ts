import { readFileSync } from "node:fs";
import { AUTOBAHN_IMAGE } from "./docker.ts";
import { exceedsInboundLimit } from "./expected-cases.ts";
import { parseReportIndex, toCaseReports } from "./report-index.ts";
import { AGENT } from "./paths.ts";
import { evaluateGate } from "./gate.ts";
import { buildSummary } from "./summary.ts";
import type { AutobahnSummary } from "./summary.ts";
import type { RunOptions } from "./run-options.ts";

/// Gates an existing report instead of running the suite.
///
/// The generation half of the harness needs the digest-pinned fuzzing client, which is
/// a frozen Python 2.7 image and so a Docker-capable host. The evaluation half needs
/// nothing at all: `evaluateGate` is a pure function of a case list, and this is the
/// whole of the rest. Treating "I have no Docker" as "I cannot check the gate" made a
/// local limitation look like a property of the protocol work, and it is the reason a
/// protocol fix could not ship with a regenerated baseline.
export async function executeFromReport(options: RunOptions): Promise<AutobahnSummary> {
  const path = options.fromReport;

  if (path === undefined) throw new Error("autobahn: --from-report needs a path");
  let cases: ReturnType<typeof toCaseReports>;

  try {
    cases = toCaseReports(parseReportIndex(readFileSync(path, "utf8"), AGENT), exceedsInboundLimit);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);

    return buildSummary({
      ok: false,
      mode: options.mode,
      agent: AGENT,
      image: AUTOBAHN_IMAGE,
      target: null,
      suiteRun: false,
      gate: null,
      cases: [],
      failure: `autobahn: ${detail}`,
      shards: [],
    });
  }

  const gate = evaluateGate(cases, options.mode);

  return buildSummary({
    ok: gate.ok,
    mode: options.mode,
    agent: AGENT,
    image: AUTOBAHN_IMAGE,
    target: null,
    suiteRun: true,
    gate,
    cases,
    failure: null,
    shards: [],
  });
}
