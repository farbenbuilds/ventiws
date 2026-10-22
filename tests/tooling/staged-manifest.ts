import { readFileSync } from "node:fs";
import { join } from "node:path";

export type StagedManifest = {
  readonly version?: string;
  readonly scripts?: Readonly<Record<string, string>>;
  readonly optionalDependencies?: Readonly<Record<string, string>>;
};

export function stagedManifest(root: string): StagedManifest {
  const manifest: StagedManifest = JSON.parse(
    readFileSync(join(root, "npm", "ventiws", "package.json"), "utf8"),
  );

  return manifest;
}
