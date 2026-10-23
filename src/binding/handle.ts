import { guardError } from "./errors";

export type ConnectionHandle = bigint;

export type UnpackedConnectionHandle = {
  readonly index: number;
  readonly generation: number;
};

const MAX_UINT32 = 0xffff_ffff;
const MAX_UINT32_BIG = 0xffff_ffffn;
const MAX_HANDLE_BIG = 0xffff_ffff_ffff_ffffn;

/// A JS caller can pass a number where the ABI declares a bigint, and a mixed comparison
/// would accept it; `BigInt` refuses that number, so equality proves the domain type.
function isBigInt(value: ConnectionHandle | number): value is bigint {
  try {
    return BigInt(value) === value;
  } catch {
    return false;
  }
}

function assertUint32(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > MAX_UINT32) {
    throw guardError(
      `ventiws: connection handle ${label} must be a uint32, got ${value}`,
      "ERR_INVALID_HANDLE",
    );
  }
}

export function packConnectionHandle(index: number, generation: number): ConnectionHandle {
  assertUint32(index, "index");
  assertUint32(generation, "generation");

  return (BigInt(generation) << 32n) | BigInt(index);
}

export function assertConnectionHandle(handle: ConnectionHandle): void {
  if (!isBigInt(handle) || handle < 0n || handle > MAX_HANDLE_BIG) {
    throw guardError(
      `ventiws: connection handle out of range: ${String(handle)}`,
      "ERR_INVALID_HANDLE",
    );
  }
}

export function unpackConnectionHandle(handle: ConnectionHandle): UnpackedConnectionHandle {
  assertConnectionHandle(handle);

  return {
    index: Number(handle & MAX_UINT32_BIG),
    generation: Number((handle >> 32n) & MAX_UINT32_BIG),
  };
}
