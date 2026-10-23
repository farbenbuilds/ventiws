import process from "node:process";

/// The runtimes a binding is resolved for. `unknown` keeps any other N-API host on the
/// Node path, because a host that can load the addon exposes a Node-shaped `process`.
export type RuntimeName = "node" | "bun" | "unknown";

type RuntimeGlobals = {
  Bun?: { version?: string };
};

export function runtimeGlobals(): RuntimeGlobals {
  // SAFETY: TypeScript does not declare the host's optional marker on the global object.
  return globalThis as RuntimeGlobals;
}

/// A bundler's `node:process` shim can carry a runtime's versions key without its
/// global, so both signals are checked. Bun is the only non-Node host that ships
/// ventiws.
export function runtimeName(): RuntimeName {
  const versions: Record<string, string | undefined> = process.versions;
  const globals = runtimeGlobals();

  if (globals.Bun !== undefined || versions.bun !== undefined) return "bun";

  if (versions.node !== undefined) return "node";

  return "unknown";
}
