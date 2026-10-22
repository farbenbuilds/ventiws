// Values crossing the native boundary carry names or ordinals, so the tables here are
// the ABI: a drift reports a different condition without failing to resolve.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { callNative, nativeError } from "../../src/binding/errors";
import {
  assertConnectionHandle,
  packConnectionHandle,
  unpackConnectionHandle,
} from "../../src/binding/handle";
import { CODEC_FAILURES, CODEC_KINDS } from "../../src/binding/codec-status";
import type { ErrorCode } from "../../src/types/errors";

type ErrorCase = readonly [string, ErrorCode];

const ERROR_CASES: readonly ErrorCase[] = [
  ["UnknownServer", "ERR_INVALID_HANDLE"],
  ["InvalidServerState", "ERR_INVALID_STATE"],
  ["ServerNotClosed", "ERR_INVALID_STATE"],
  ["EventsPending", "ERR_INVALID_STATE"],
  ["EnvCleanupUnavailable", "ERR_INVALID_STATE"],
  ["InvalidHost", "ERR_INVALID_OPTION"],
  ["InvalidPort", "ERR_INVALID_OPTION"],
  ["InvalidBacklog", "ERR_INVALID_OPTION"],
  ["InvalidPath", "ERR_INVALID_OPTION"],
  ["InvalidConnectionCapacity", "ERR_INVALID_OPTION"],
  ["InvalidMessageCapacity", "ERR_INVALID_OPTION"],
  ["InvalidFrameCapacity", "ERR_INVALID_OPTION"],
  ["ThreadsafeFunctionUnavailable", "ERR_PROTOCOL"],
  ["CapacityExhausted", "ERR_INVALID_STATE"],
  ["ServerCapacityExhausted", "ERR_INVALID_STATE"],
  ["EngineWorkerMissing", "ERR_INVALID_STATE"],
  ["AddressInUse", "ERR_INVALID_STATE"],
  ["SystemResources", "ERR_INVALID_STATE"],
  ["ThreadQuotaExceeded", "ERR_INVALID_STATE"],
  ["OutOfMemory", "ERR_INVALID_STATE"],
];

test.each(ERROR_CASES)("maps the native %s error to %s", (name, code) => {
  const error = nativeError(new Error(name));

  expect(error.code).toBe(code);
  expect(error.message).toBe(name);
});

test("an unknown native name is an ABI mismatch", () => {
  expect(nativeError(new Error("SomethingNew")).code).toBe("ERR_PROTOCOL");
  expect(nativeError("not an error").code).toBe("ERR_PROTOCOL");
});

test("callNative passes values through and rethrows coded errors", () => {
  expect(callNative(() => 42)).toBe(42);
  expect(() =>
    callNative(() => {
      throw new Error("InvalidPort");
    }),
  ).toThrow(expect.objectContaining({ code: "ERR_INVALID_OPTION" }));
});

test("a handle keeps the index low and the generation high", () => {
  const handle = packConnectionHandle(0xdead_beef, 0x0102_0304);

  expect(handle).toBe(0x0102_0304_dead_beefn);
  expect(unpackConnectionHandle(handle)).toEqual({
    index: 0xdead_beef,
    generation: 0x0102_0304,
  });
  expect(unpackConnectionHandle(packConnectionHandle(0xffff_ffff, 0xffff_ffff))).toEqual({
    index: 0xffff_ffff,
    generation: 0xffff_ffff,
  });
});

test.each([
  ["a negative index", -1, 0],
  ["a generation above uint32", 0, 2 ** 32],
  ["an index above uint32", 2 ** 32, 0],
] as const)("packing rejects %s", (_name, index, generation) => {
  expect(() => packConnectionHandle(index, generation)).toThrow(RangeError);
});

test("the handle guard rejects out-of-range bigints", () => {
  expect(() => assertConnectionHandle(-1n)).toThrow(RangeError);
  expect(() => assertConnectionHandle(1n << 64n)).toThrow(RangeError);
  expect(() => unpackConnectionHandle(-1n)).toThrow(RangeError);
  expect(() => assertConnectionHandle(0n)).not.toThrow();
  expect(() => assertConnectionHandle((1n << 64n) - 1n)).not.toThrow();
});

const ENUM_SOURCE = readFileSync(
  fileURLToPath(new URL("../../src/engine/codec/events.zig", import.meta.url)),
  "utf8",
);

function zigMembers(enumName: string): string[] {
  const body = new RegExp(`pub const ${enumName} = enum\\([^)]*\\) \\{([\\s\\S]*?)\\n\\};`);
  const matched = body.exec(ENUM_SOURCE);

  expect(matched, `no enum ${enumName} in events.zig`).not.toBeNull();

  return (matched?.[1] ?? "")
    .split("\n")
    .map((line) => /^\s{4}([a-z][a-z0-9_]*)\s*(=\s*\d+)?,/.exec(line)?.[1])
    .filter((name): name is string => name !== undefined);
}

/// The camelCase spelling TypeScript uses. `unexpected_rsv_2_3` cannot start with a
/// digit, so the one rename is explicit rather than a silent mismatch.
function tsName(zigName: string): string {
  if (zigName === "unexpected_rsv_2_3") return "unexpectedRsv2or3";
  const [head, ...rest] = zigName.split("_");

  return head + rest.map((part) => part.slice(0, 1).toUpperCase() + part.slice(1)).join("");
}

const VOCABULARIES: readonly (readonly [string, readonly string[]])[] = [
  ["Failure", CODEC_FAILURES],
  ["Kind", CODEC_KINDS],
];

test.each(VOCABULARIES)("the %s vocabulary matches Zig in declaration order", (enumName, table) => {
  expect(zigMembers(enumName).map(tsName)).toEqual([...table]);
});

test("the failure ordinals are dense and start at one", () => {
  expect(zigMembers("Failure")).toHaveLength(CODEC_FAILURES.length);
});
