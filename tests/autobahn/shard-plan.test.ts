// The options, resolver, and plan are one contract; a plan that misses a group fails the gate.

import { afterEach, describe, expect, it } from "vitest";
import { HOST_GATEWAY } from "../autobahn/docker.ts";
import { MODE_COUNTS } from "../autobahn/expected-cases.ts";
import { parseOptions } from "../autobahn/run-options.ts";
import {
  DEFAULT_SHARD_COUNT,
  SHARD_PORT_BASE,
  maxShardsFor,
  planShards,
  resolveShardCount,
  shardContainerName,
  shardSpec,
} from "../autobahn/shard-plan.ts";

function selected(plan: ReturnType<typeof planShards>): readonly string[] {
  return plan.flatMap((shard) => [...shard.groups]).sort();
}

describe("run options and the environment", () => {
  const key = "AUTOBAHN_SHARDS";
  const saved = process.env[key];

  afterEach(() => {
    if (saved === undefined) delete process.env[key];
    else process.env[key] = saved;
  });

  it("parses flags, the report path, and the environment count", () => {
    const defaults = parseOptions([]);
    expect(defaults).toMatchObject({ mode: "framing", shards: 1, force: false, help: false });
    expect(defaults.fromReport).toBeUndefined();
    expect(parseOptions(["--help"])).toMatchObject({ help: true, mode: "framing" });
    expect(parseOptions(["--full"]).mode).toBe("full");
    expect(parseOptions(["--shards", "4"]).shards).toBe(4);
    expect(parseOptions(["--full", "--shards", "8"]).shards).toBe(8);
    // The mode still parses: gating a framing report as full would report deflate as missing.
    expect(parseOptions(["--from-report", "/tmp/index.json"]).fromReport).toBe("/tmp/index.json");
    expect(parseOptions(["--full", "--from-report", "/tmp/index.json"]).mode).toBe("full");

    delete process.env[key];
    expect(parseOptions([]).shards).toBe(1);
    process.env[key] = "4";
    expect(parseOptions([]).shards).toBe(4);
    expect(parseOptions(["--shards", "2"]).shards).toBe(2);
    // `framing` has ten groups, so eleven shards would leave one empty.
    process.env[key] = "11";
    expect(() => parseOptions([])).toThrow(RangeError);
    expect(() => parseOptions(["--full"])).not.toThrow();
    process.env[key] = "four";
    expect(() => parseOptions([])).toThrow(RangeError);
  });

  const rejected: ReadonlyArray<readonly [readonly string[], string]> = [
    [["--from-report"], "no path"],
    [["--from-report", "--full"], "no path"],
    [["--nope"], "unknown"],
    [["--shards"], "missing"],
    [["--shards", "0"], "zero"],
    [["--shards", "two"], "non-numeric"],
  ];

  it.each(rejected)("rejects %j (%s)", (argv) => {
    expect(() => parseOptions(argv)).toThrow(RangeError);
  });
});

describe("the shard plan and spec", () => {
  it("covers every group, stays under the critical path, and shapes each spec", () => {
    for (const mode of ["framing", "full"] as const)
      for (const count of [1, 2, 3, 4, 5, 8]) {
        expect(selected(planShards(count, mode))).toEqual([...MODE_COUNTS[mode].groups].sort());
        expect(planShards(count, mode)).toHaveLength(count);
      }

    const plan = planShards(4, "full");
    const ports = plan.map((shard) => shard.port);
    expect(new Set(ports).size).toBe(ports.length);

    for (const port of ports) expect(port).toBeGreaterThan(9001);
    expect(ports[0]).toBe(SHARD_PORT_BASE);

    for (const shard of plan)
      for (const pattern of shard.cases) expect(pattern).toMatch(/^\d+\.\*$/);

    const unsplit = planShards(1, "full")[0].costSeconds;
    const framed = planShards(4, "framing");
    const heaviest = Math.max(...framed.map((shard) => shard.costSeconds));
    const total = framed.reduce((sum, shard) => sum + shard.costSeconds, 0);
    expect(Math.max(...plan.map((shard) => shard.costSeconds))).toBeLessThan(unsplit);
    // Group 6 is 145 of the 301 framing cases, so no weight table can beat this without
    // splitting a group, and the `cases` patterns exist to keep coverage provable.
    expect(heaviest / total).toBeGreaterThan(0.4);

    for (const count of [2, 3, 4, 5, 8])
      expect(
        Math.max(...planShards(count, "framing").map((s) => s.costSeconds)),
      ).toBeGreaterThanOrEqual(planShards(1, "framing")[0].costSeconds * 0.45);

    for (const shard of plan) {
      const spec = shardSpec(shard);
      expect(spec.servers).toHaveLength(1);
      expect(spec.servers[0].url).toBe(`ws://${HOST_GATEWAY}:${shard.port}`);
      expect(spec.servers[0].agent).toBe("ventiws");
    }

    const spec = shardSpec(planShards(2, "framing")[0]);
    const names = plan.map((shard) => shardContainerName(shard.id));

    expect(spec.outdir.startsWith("/reports")).toBe(true);
    expect(spec["exclude-cases"]).toEqual([]);
    expect(spec["exclude-agent-cases"]).toEqual({});
    expect(new Set(names).size).toBe(names.length);
    expect(planShards(DEFAULT_SHARD_COUNT, "full")).toHaveLength(DEFAULT_SHARD_COUNT);

    for (const mode of ["framing", "full"] as const)
      expect(DEFAULT_SHARD_COUNT).toBeLessThanOrEqual(maxShardsFor(mode));
  });

  const refused: ReadonlyArray<readonly [number, string]> = [
    [0, "zero"],
    [2.5, "fraction"],
    [-1, "negative"],
  ];

  it.each(refused)("rejects the shard count %s (%s)", (count) => {
    expect(() => planShards(count, "full")).toThrow(RangeError);
  });

  it("rejects more shards than groups, is pure, and resolves the flag", () => {
    // A shard that owns no group runs no cases, so the union is short and fails the
    // count gate after the build rather than at the plan.
    for (const mode of ["framing", "full"] as const) {
      const groups = MODE_COUNTS[mode].groups.length;

      expect(() => planShards(groups + 1, mode)).toThrow(RangeError);
      expect(() => planShards(groups, mode)).not.toThrow();
    }

    expect(planShards(4, "full")).toEqual(planShards(4, "full"));
    expect(resolveShardCount("4", "full")).toBe(4);
    expect(resolveShardCount(1, "framing")).toBe(1);
    expect(() => resolveShardCount(String(maxShardsFor("framing") + 1), "framing")).toThrow(
      RangeError,
    );
    expect(() => resolveShardCount("", "full")).toThrow(RangeError);
    expect(() => resolveShardCount("many", "full")).toThrow(RangeError);
  });
});
