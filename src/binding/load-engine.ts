import { arch, platform } from "node:process";
import { artifactPath, packageRoot } from "./addon-path";
import { unloadableAddonMessage } from "./addon-error";
import { guardError } from "./errors";
import { openAddon } from "./open";
import { runtimeName } from "./runtime";
import type { CodecAddon, EngineAddon } from "./native";

/// The engine addon is a development build: never an optional dependency, so there is no
/// installed fallback and no `ventiws.node` fallback that could load the codec by mistake.
const checkoutSegments = ["zig-out", "lib", "ventiws-engine.node"] as const;
const legacySegments = ["dist", "ventiws-engine.node"] as const;

let engineAddon: EngineAddon | undefined;

/// Cached apart from `loadAddon`, because the two artifacts carry different ABIs and a
/// process can legitimately hold both.
export function loadEngineAddon(): EngineAddon {
  if (engineAddon !== undefined) return engineAddon;
  engineAddon = resolveEngineAddon();

  return engineAddon;
}

function resolveEngineAddon(): EngineAddon {
  const root = packageRoot();
  const artifact = artifactPath(root, ...checkoutSegments) ?? artifactPath(root, ...legacySegments);

  if (artifact === undefined)
    throw guardError(missingEngineMessage(root), "ERR_INVALID_STATE", Error);

  const addon = openEngineArtifact(artifact);

  if (!hasEngineSurface(addon)) {
    throw guardError(engineAbiMessage(artifact), "ERR_PROTOCOL", Error);
  }

  return addon;
}

function openEngineArtifact(path: string): CodecAddon {
  try {
    return openAddon(path);
  } catch (cause) {
    throw Object.assign(new Error(unloadableAddonMessage(path, platform, arch, runtimeName())), {
      cause,
    });
  }
}

function hasEngineSurface(addon: CodecAddon): addon is EngineAddon {
  return "createServer" in addon && typeof addon.createServer !== "undefined";
}

function missingEngineMessage(root: string | undefined): string {
  const where = root ?? "the package root";
  const candidates = `${checkoutSegments.join("/")} or ${legacySegments.join("/")}`;

  return (
    `ventiws: the development engine addon was not found under ${where} (${candidates}). ` +
    'It is built from a checkout and is never installed; run "pnpm build:binding".'
  );
}

function engineAbiMessage(path: string): string {
  return (
    `ventiws: the addon at ${path} has no engine ABI (createServer is missing), so it is the ` +
    'codec-only artifact; run "pnpm build:binding" to build the engine addon.'
  );
}
