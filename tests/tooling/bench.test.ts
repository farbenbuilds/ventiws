// The benchmark contract is stated twice: as code defaults in `bench/support/` and as
// the frozen env file the publisher hashes. The publisher then writes an immutable record
// beside its raw evidence, so a drift is refused at publication rather than leaving a gap.

import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { ALL_IMPLEMENTATION_IDS, BASELINE_ID, CANDIDATE_ID } from "../../bench/echo/echo-types";
import {
  DEFAULT_MESSAGES,
  DEFAULT_PAYLOAD_SIZES,
  DEFAULT_REPEATS,
  DEFAULT_WARMUPS,
  GATE_MIN_RATIO,
} from "../../bench/support/options";
import { SCHEMA_VERSION } from "../../bench/support/provenance";
import {
  BENCHMARK_ID,
  RECORD_SCHEMA_VERSION,
  REPORT_SCHEMA_VERSION,
} from "../../scripts/bench-contract.mjs";
import { publishRecord } from "../../scripts/bench-history.mjs";
import { CONTRACT, build, publishInput, read, reportOf } from "./bench-fixtures";

type SchemaNode = {
  readonly const?: unknown;
  readonly properties?: Readonly<Record<string, SchemaNode>>;
};

type HistoryIndex = { readonly records: readonly { readonly record_id: string }[] };

const SCHEMA: SchemaNode = JSON.parse(read("bench/contracts/echo_throughput_v2.schema.json"));

function expectAll(source: string, needles: readonly string[]): void {
  for (const needle of needles) expect(source).toContain(needle);
}

const historyOf = (): string => mkdtempSync(join(tmpdir(), "ventiws-bench-history-"));

test("the contract and schema agree with the harness", () => {
  expect(CONTRACT).toMatchObject({
    implementations: [...ALL_IMPLEMENTATION_IDS],
    gateBaseline: BASELINE_ID,
    gateCandidate: CANDIDATE_ID,
    gateMinimumRatio: GATE_MIN_RATIO,
    payloadSizes: [...DEFAULT_PAYLOAD_SIZES],
    messages: DEFAULT_MESSAGES,
    repeats: DEFAULT_REPEATS,
    warmups: DEFAULT_WARMUPS,
    wireBytesBasis: "payload-only",
  });
  expect(REPORT_SCHEMA_VERSION).toBe(SCHEMA_VERSION);
  const properties = SCHEMA.properties ?? {};
  const guarantee = properties.guarantee?.properties ?? {};
  expect(properties.benchmark_id?.const).toBe(BENCHMARK_ID);
  expect(properties.schema_version?.const).toBe(RECORD_SCHEMA_VERSION);
  expect(guarantee.minimum_baseline_ratio?.const).toBe(GATE_MIN_RATIO);
  expect(guarantee.formula?.const).toContain("minimum_baseline_ratio");
});

test("a contract-conforming report becomes a record with its provenance", () => {
  const record = build(reportOf());
  expect(record.record_id).toBe(`123-1-${"a".repeat(12)}`);
  expect(record.guarantee.passed).toBe(true);
  expect(record.results.configurations).toHaveLength(4);
  expect(record.results.configurations[0].candidate_to_baseline_ratio).toBeCloseTo(1, 5);
  expect(() => build(reportOf(200_001))).toThrow(/messages does not match the contract/);
});

test("publishing writes the record, its raw report, and the branch scaffolding", () => {
  const history = historyOf();
  const record = build(reportOf());
  const id = publishRecord(publishInput(record, history));
  expect(id).toBe(record.record_id);
  expect(existsSync(join(history, "records", "2026", `${id}.json`))).toBe(true);
  expect(existsSync(join(history, "raw", "2026", id, "report.json"))).toBe(true);
  expect(existsSync(join(history, "schema", "echo_throughput_v2.schema.json"))).toBe(true);
  expect(existsSync(join(history, ".nojekyll"))).toBe(true);
  expect(
    readdirSync(join(history, "contracts")).some((name) => name.startsWith("CONTRACT-v2-")),
  ).toBe(true);

  const index: HistoryIndex = JSON.parse(readFileSync(join(history, "index.json"), "utf8"));
  expect(index.records).toHaveLength(1);
  expect(index.records[0]?.record_id).toBe(id);
  expectAll(readFileSync(join(history, "README.md"), "utf8"), [
    "Latest results",
    "contracts/CONTRACT-v2-",
    "aaaaaaaaaaaa",
  ]);
});

test("a new series archives the old index and contract edits snapshot separately", () => {
  const history = historyOf();
  const input = publishInput(build(reportOf()), history);
  writeFileSync(
    join(history, "index.json"),
    `${JSON.stringify({ schema_version: 1, benchmark_id: "echo-throughput-v1", records: [] })}\n`,
  );
  publishRecord(input);
  const archived = JSON.parse(readFileSync(join(history, "index-echo-throughput-v1.json"), "utf8"));
  expect(archived.benchmark_id).toBe("echo-throughput-v1");

  const active: { readonly benchmark_id: string } = JSON.parse(
    readFileSync(join(history, "index.json"), "utf8"),
  );

  expect(active.benchmark_id).toBe("echo-throughput-v2");

  const next = {
    ...input,
    record: {
      ...input.record,
      record_id: `124-1-${"b".repeat(12)}`,
      recorded_at: "2026-10-04T00:00:00.000Z",
    },
    contractDocSource: `${input.contractDocSource}\nUpdated measurement notes.\n`,
  };

  publishRecord(next);
  expect(
    readdirSync(join(history, "contracts")).filter((name) => name.endsWith(".md")),
  ).toHaveLength(2);
});

test("republishing identical content is idempotent and different content is refused", () => {
  const history = historyOf();
  const input = publishInput(build(reportOf()), history);
  publishRecord(input);
  expect(() => publishRecord(input)).not.toThrow();
  const changed = build({ ...reportOf(), gate: { failed: true } });
  expect(() => publishRecord({ ...input, record: changed })).toThrow(/immutable/);
});
