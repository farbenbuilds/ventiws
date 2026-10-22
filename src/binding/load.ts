import { arch, platform } from "node:process";
import { createRequire } from "node:module";
import { artifactPath, packageRoot } from "./addon-path";
import { missingAddonMessage, unloadableAddonMessage } from "./addon-error";
import { openAddon } from "./open";
import { bindingPackageName, hostAddonTarget, PUBLISHED_TARGETS } from "./target";
import { runtimeName } from "./runtime";
import type { AddonTarget } from "./target";
import type { CodecAddon } from "./native";

export type { CodecAddon } from "./native";

export type { AddonTarget } from "./target";

const require = createRequire(import.meta.url);

/// A checkout has the build output first, because a developer working in the tree wants
/// the freshly built artifact rather than a published one that happens to be installed
/// beside it. A packaged install has only `dist` and its `@ventiws/binding-*` package.
const checkoutSegments = ["zig-out", "lib", "ventiws.node"] as const;
const legacySegments = ["dist", "ventiws.node"] as const;

/// `require.resolve` rather than `require`, so an absent optional dependency is an
/// `undefined` and a present-but-unloadable one still reaches the loader and produces the
/// error that names the artifact. npm installs an optional dependency only when the host
/// matches its `os`, `cpu`, and `libc`, so an unpublished target arrives here as absent.
function installedBinding(target: AddonTarget): string | undefined {
  try {
    return require.resolve(bindingPackageName(target));
  } catch {
    return undefined;
  }
}

let addon: CodecAddon | undefined;

/// Lazy on purpose: importing ventiws must not fail for a program that never opens a
/// socket, and the load is a filesystem lookup plus a `dlopen`. A caller who imports the
/// package, gets a `SyntaxError` about a missing binary, and never finds out that the
/// library works fine is a worse first impression than a load on first use.
export function loadAddon(): CodecAddon {
  if (addon !== undefined) return addon;
  addon = resolveAddon();

  return addon;
}

function resolveAddon(): CodecAddon {
  const root = packageRoot();
  const target = hostAddonTarget();

  const checkout = artifactPath(root, ...checkoutSegments);

  if (checkout !== undefined) return loadArtifact(checkout);

  if (target !== undefined) {
    const installed = installedBinding(target);

    if (installed !== undefined) return loadArtifact(installed);
  }

  const legacy = artifactPath(root, ...legacySegments);

  if (legacy !== undefined) return loadArtifact(legacy);

  throw new Error(
    missingAddonMessage(root, platform, arch, target, PUBLISHED_TARGETS, runtimeName()),
  );
}

function loadArtifact(path: string): CodecAddon {
  try {
    return openAddon(path);
  } catch (cause) {
    // The raw error for an artifact that exists and will not `dlopen` is a symbol the
    // caller has never heard of, from a file they did not know existed.
    throw Object.assign(new Error(unloadableAddonMessage(path, platform, arch, runtimeName())), {
      cause,
    });
  }
}
