import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/// A host whose fs module throws where Node returns false is treated as an absent path;
/// the loader's own message is more actionable than that permission error.
function pathExists(path: string): boolean {
  try {
    return existsSync(path);
  } catch {
    return false;
  }
}

function findPackageRoot(start: string): string | undefined {
  let current: string | undefined = start;

  while (current !== undefined) {
    if (pathExists(join(current, "package.json"))) return current;
    const parent = dirname(current);
    current = parent === current ? undefined : parent;
  }

  return undefined;
}

export function packageRoot(): string | undefined {
  return findPackageRoot(dirname(fileURLToPath(import.meta.url)));
}

/// A checkout-relative artifact path, or `undefined` when the file is absent.
export function artifactPath(
  root: string | undefined,
  ...segments: readonly string[]
): string | undefined {
  if (root === undefined) return undefined;
  const candidate = join(root, ...segments);

  return pathExists(candidate) ? candidate : undefined;
}
