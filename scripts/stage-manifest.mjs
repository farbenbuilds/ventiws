// The staged package tree under `npm/ventiws`: the scaffolded manifest is replaced with
// the repository's own, the bundle and the npm-included files are copied in, and the
// scaffolded loaders this project does not ship are removed.

import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const ADDON = "ventiws";
export const SCOPE_DIR = "@ventiws";
export const BINDING_PREFIX = "binding-";
export const STAGE = join("npm", ADDON);

/// Repository-only fields. A published manifest carries no build script, no dev
/// toolchain, and no package-manager pin, because nothing in the tarball can run them.
const REPO_ONLY = ["scripts", "devDependencies", "packageManager"];

/// The scaffolded files for the shape this project does not ship. `index.js` and
/// `index.d.ts` re-export the Zig module's own decls, and `binding.js` is a second
/// loader; leaving any of them beside an `exports` map that does not name them is a
/// file a reader can reach and cannot account for.
const SCAFFOLDED = ["index.js", "index.d.ts", "binding.js"];

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

/// The bundle and the two files npm force-includes when it packs this directory.
///
/// npm force-inclusion is the only reason `files` does not already name them, and it
/// does not pull them from the repository: this copy is what puts them in the tarball.
/// Without it the published page renders as a bare name and version.
export function stageFiles() {
  if (!existsSync("dist")) {
    throw new Error("stage-publish: dist/ is missing; run tsdown first");
  }

  cpSync("dist", join(STAGE, "dist"), { recursive: true });

  for (const file of ["README.md", "LICENSE"]) cpSync(file, join(STAGE, file));

  for (const file of SCAFFOLDED) rmSync(join(STAGE, file), { force: true });
}

/// The staged manifest and every platform manifest, all at the release version.
export function writeManifests(repo, targets) {
  const optional = {};

  for (const target of targets) optional[`${SCOPE_DIR}/${BINDING_PREFIX}${target}`] = repo.version;
  const manifest = { ...repo };

  for (const key of REPO_ONLY) delete manifest[key];
  writeJson(join(STAGE, "package.json"), { ...manifest, optionalDependencies: optional });

  for (const target of targets) {
    const path = join(STAGE, SCOPE_DIR, `${BINDING_PREFIX}${target}`, "package.json");
    writeJson(path, { ...readJson(path), version: repo.version });
  }
}
