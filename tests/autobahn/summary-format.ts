import { KNOWN_FAILURES } from "./baseline.ts";
import { INBOUND_LIMIT_BYTES, MODE_COUNTS } from "./expected-cases.ts";
import type { GateCounts } from "./gate.ts";
import type { CaseReport } from "./report-index.ts";
import type { Shard } from "./shard-plan.ts";
import type { AutobahnSummary } from "./summary.ts";
import { measuredSeconds } from "./summary.ts";

function describeCounts(counts: GateCounts, mode: "framing" | "full"): readonly string[] {
  const expected = MODE_COUNTS[mode];

  return [
    `cases      ${counts.total} (expected ${expected.total})`,
    `passed     ${counts.passed} of ${expected.evaluated} evaluated`,
    `failed     ${counts.failed}`,
    `capacity   ${counts.capacity} of ${expected.capacity} above ${INBOUND_LIMIT_BYTES} bytes`,
    `non-strict ${counts.nonStrict}`,
  ];
}

/// The plan and what it was worth. The critical path is the largest shard, and
/// it is the number the weight table has to keep small, so it is printed even on
/// a run that failed before the suite.
function describeShards(shards: readonly Shard[], cases: readonly CaseReport[]): readonly string[] {
  if (shards.length === 0) return [];
  const critical = Math.max(...shards.map((shard) => shard.costSeconds));
  const lines = [`shards     ${shards.length} (expected critical path ${critical.toFixed(0)}s)`];

  for (const shard of shards) {
    lines.push(
      `  shard ${shard.id} port ${shard.port} ${shard.groups.join(" ").padEnd(24)} ` +
        `${shard.costSeconds.toFixed(0).padStart(6)}s expected`,
    );
  }

  if (cases.length > 0) {
    lines.push(`measured   ${measuredSeconds(cases).toFixed(1)}s across ${cases.length} cases`);
  }

  return lines;
}

export function formatSummary(summary: AutobahnSummary): string {
  const lines: string[] = ["autobahn: report gate"];
  lines.push(
    `mode       ${summary.mode}${summary.mode === "framing" ? " (deflate groups omitted)" : ""}`,
  );

  if (summary.target !== null) {
    lines.push(
      `target     port ${summary.target.port} engine ${summary.target.engine} echo ${String(summary.target.echo)}`,
    );
  }

  if (summary.failure !== null) lines.push(`blocked    ${summary.failure}`);

  if (!summary.suiteRun) lines.push("suite      not run");

  if (summary.counts !== null) lines.push(...describeCounts(summary.counts, summary.mode));
  lines.push(...describeShards(summary.shards, summary.cases));
  lines.push(
    `baseline   ${KNOWN_FAILURES.size} known failures across ${KNOWN_FAILURES.groups.length} groups`,
  );

  for (const group of KNOWN_FAILURES.groups) {
    lines.push(
      `  group ${group.group.padEnd(3)} ${String(group.count).padStart(3)} cases  ${group.reason}`,
    );
  }

  for (const violation of summary.violations)
    lines.push(`  [${violation.kind}] ${violation.detail}`);
  lines.push(`result     ${summary.ok ? "PASS" : "FAIL"}`);

  return lines.join("\n");
}
