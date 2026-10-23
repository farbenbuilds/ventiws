import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { EngineEvent, VentiAddon } from "../../src/binding/native.ts";
import { isJsonRecord, jsonBoolean, jsonNumber, jsonString } from "./json-reading.ts";
import type { JsonValue } from "./json-reading.ts";
import { PACKAGE_ROOT } from "./paths.ts";

/// `src/binding` uses extensionless relative imports, which Node's type
/// stripping cannot resolve at runtime; only the ABI declaration is reused
/// here, and it is erased before execution. The addon itself is loaded the way
/// `src/binding/load-engine.ts` loads it, with the same candidate order, so the
/// target and the unit tests exercise the same development artifact.
const CANDIDATE_PATHS = [
  ["zig-out", "lib", "ventiws-engine.node"],
  ["dist", "ventiws-engine.node"],
] as const;

const require = createRequire(import.meta.url);

function resolveAddonPath(): string {
  for (const parts of CANDIDATE_PATHS) {
    const candidate = join(PACKAGE_ROOT, ...parts);

    if (existsSync(candidate)) return candidate;
  }

  throw new Error(
    `ventiws: native addon not found under ${PACKAGE_ROOT}; run "pnpm build:binding" first`,
  );
}

let addon: VentiAddon | undefined;

export function loadVentiwsAddon(): VentiAddon {
  if (addon === undefined) {
    const loaded: VentiAddon = require(resolveAddonPath());

    addon = loaded;
  }

  return addon;
}

export type { EngineEvent, VentiAddon };

export function pack(index: number, generation: number): bigint {
  return (BigInt(generation) << 32n) | BigInt(index);
}

/// The contract between the target and the runner: one newline-delimited JSON
/// record on stdout, tagged with a prefix so unrelated child output can be
/// forwarded to the runner's log without being mistaken for the handshake.

export const READY_PREFIX = "ventiws-autobahn-target ";

/// The capacity the engine was compiled with. `message_capacity` in
/// `src/engine/server/options.zig` is a Zig `comptime` constant baked into the
/// addon, so the target reports the value it actually passes to the engine
/// rather than a number the harness assumed.
export type TargetReady = {
  readonly host: string;
  readonly port: number;
  readonly engine: string;
  readonly maxFrameBytes: number;
  readonly maxMessageBytes: number;
  readonly echo: boolean;
  readonly echoReason: string | null;
};

function isTargetReady(value: JsonValue): value is TargetReady {
  if (!isJsonRecord(value)) return false;

  return (
    jsonNumber(value["port"]) !== null &&
    jsonString(value["host"]) !== null &&
    jsonBoolean(value["echo"]) !== null &&
    jsonNumber(value["maxFrameBytes"]) !== null &&
    jsonNumber(value["maxMessageBytes"]) !== null &&
    jsonString(value["engine"]) !== null &&
    (value["echoReason"] === null || jsonString(value["echoReason"]) !== null)
  );
}

export function encodeTargetReady(record: TargetReady): string {
  return `${READY_PREFIX}${JSON.stringify(record)}`;
}

/// Returns null for any line that is not the ready record, so the caller can
/// forward it instead of failing the run on unrelated child output.
export function decodeTargetReady(line: string): TargetReady | null {
  if (!line.startsWith(READY_PREFIX)) return null;
  let parsed: JsonValue;

  try {
    parsed = JSON.parse(line.slice(READY_PREFIX.length));
  } catch {
    return null;
  }

  if (!isTargetReady(parsed)) return null;

  return parsed;
}
