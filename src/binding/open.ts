import { createRequire } from "node:module";
import type { CodecAddon } from "./native";

const require = createRequire(import.meta.url);

/// Node and Bun both load a precompiled N-API addon through the CommonJS loader. The
/// platform package points its `main` at the `.node`, so the resolved path is the addon.
export function openAddon(path: string): CodecAddon {
  const addon: CodecAddon = require(path);

  return addon;
}
