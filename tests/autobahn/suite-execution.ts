import { probeTarget } from "./probe-echo.ts";
import type { EchoProbe } from "./probe-echo.ts";
import type { SuiteMode } from "./expected-cases.ts";
import type { CaseReport } from "./report-index.ts";
import type { Shard } from "./shard-plan.ts";
import type { TargetProcess } from "./target-process.ts";
import type { ShardResult } from "./shard-reports.ts";
import { runFuzzingClient, reportExists, readReportCases } from "./suite.ts";
import { runShards, unionCases } from "./shard-reports.ts";

/// What one run measured.
export type Execution = {
  readonly probe: EchoProbe | null;
  readonly suiteRun: boolean;
  readonly cases: readonly CaseReport[];
  readonly failure: string | null;
};

export function probeOf(target: TargetProcess): Promise<EchoProbe> {
  return probeTarget({
    port: target.ready.port,
    engine: target.ready.engine,
    inboundLimitBytes: target.ready.maxMessageBytes,
  });
}

/// The unsplit path, unchanged in behaviour from before sharding existed.
async function runSingle(mode: SuiteMode, target: TargetProcess): Promise<Execution> {
  const probe = await probeOf(target);
  const code = await runFuzzingClient(mode);
  if (!reportExists()) {
    return { probe, suiteRun: true, cases: [], failure: `wstest wrote no report (exit ${code})` };
  }
  return {
    probe,
    suiteRun: true,
    cases: readReportCases(),
    failure: code === 0 ? null : `wstest exited with code ${code}`,
  };
}

export function describeShardFailure(results: readonly ShardResult[]): string | null {
  if (results.every((result) => result.cases.length === 0)) return "no shard wrote a report";
  const silent = results.filter((result) => result.cases.length === 0);
  if (silent.length > 0) {
    return `shards ${namedWithCodes(silent)} wrote no report; the suite covers fewer cases than its mode selects`;
  }
  const failed = results.filter((result) => result.code !== 0);
  if (failed.length > 0) return `wstest exited non-zero for shards ${namedWithCodes(failed)}`;
  return null;
}

/// Names the exit code with the shard: a container killed before Python flushed its
/// buffered stdout leaves no other evidence, and the code (137 is SIGKILL) tells an OOM
/// kill from a launch failure that a bare shard number hides.
function namedWithCodes(results: readonly ShardResult[]): string {
  return results.map((result) => `${result.shard.id} (exit ${result.code})`).join(", ");
}

/// The sharded path.
///
/// Every shard is probed before any container starts, so a target that cannot
/// echo is detected here rather than after the suite has recorded timeouts
/// against it. The probes run concurrently: the cost is one echo round trip each.
export async function runShardedFor(
  shards: readonly Shard[],
  targets: readonly TargetProcess[],
): Promise<Execution> {
  const probes = await Promise.all(targets.map((target) => probeOf(target)));
  const results = await runShards(shards);
  return {
    probe: probes[0] ?? null,
    suiteRun: true,
    cases: unionCases(results),
    failure: describeShardFailure(results),
  };
}

/// Refuses to measure a target that cannot echo, because the suite would only
/// record timeouts. `--force` overrides it so a failing run still produces
/// evidence.
export function blockedByProbe(probe: EchoProbe, port: number, force: boolean): Execution | null {
  if (probe.echo || force) return null;
  return {
    probe,
    suiteRun: false,
    cases: [],
    failure:
      `target on port ${port} cannot echo (${probe.detail}); ` +
      "the suite would only record timeouts. Re-run with --force to capture " +
      "that evidence anyway.",
  };
}

export function runSingleFor(mode: SuiteMode, target: TargetProcess): Promise<Execution> {
  return runSingle(mode, target);
}
