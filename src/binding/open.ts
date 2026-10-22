import { createRequire } from "node:module";
import process from "node:process";
import { guardError } from "./errors";
import { runtimeName } from "./runtime";
import type { VentiAddon } from "./native";

const require = createRequire(import.meta.url);

/// Deno's documented form passes an explicit flag; Node and Bun accept and ignore it.
const DLOPEN_FLAGS = 0;

/// Deno's documented route to a precompiled N-API addon is `process.dlopen`, and a
/// permission failure through `require` names the CJS loader rather than `--allow-ffi`.
/// Node and Bun keep `require`, which is how the platform packages already resolve.
export function openAddon(path: string): VentiAddon {
  if (runtimeName() === "deno") return denoAddon(path);

  const addon: VentiAddon = require(path);

  return addon;
}

type AddonModule = { exports: VentiAddon | undefined };

function denoAddon(path: string): VentiAddon {
  const addon: AddonModule = { exports: undefined };
  process.dlopen(addon, path, DLOPEN_FLAGS);

  if (addon.exports === undefined) {
    throw guardError("ventiws: process.dlopen loaded no addon exports", "ERR_PROTOCOL", Error);
  }

  return addon.exports;
}
