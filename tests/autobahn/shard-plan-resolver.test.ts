import { describe, expect, it } from "vitest";
import { maxShardsFor, resolveShardCount } from "../autobahn/shard-plan.ts";

describe("the shared shard-count resolver", () => {
  it("accepts a positive integer as a string or a number", () => {
    expect(resolveShardCount("4", "full")).toBe(4);
    expect(resolveShardCount(1, "framing")).toBe(1);
  });

  it("applies the same ceiling the plan does", () => {
    expect(() => resolveShardCount(String(maxShardsFor("framing") + 1), "framing")).toThrow(
      RangeError,
    );
  });

  it("rejects the empty and non-numeric strings the environment can hold", () => {
    expect(() => resolveShardCount("", "full")).toThrow(RangeError);
    expect(() => resolveShardCount("many", "full")).toThrow(RangeError);
  });
});
