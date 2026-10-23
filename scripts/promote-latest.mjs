import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const { platforms } = JSON.parse(
  readFileSync(new URL("../src/builds/platforms.json", import.meta.url), "utf8"),
);

const packages = [...platforms.map((platform) => `@ventiws/binding-${platform}`), "ventiws"];

const versionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

const npm = (args) =>
  execFileSync("npm", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function expectRegistryValue(args, expected, run, wait, label) {
  // npm can accept a publish before its new version is visible to registry reads.
  for (let attempt = 0; attempt < 18; attempt += 1) {
    try {
      if (JSON.parse(run(args)) === expected) return;
    } catch {
      // A newly published version may return 404 during registry propagation.
    }

    if (attempt < 17) await wait(10_000);
  }

  throw new Error(`${label} did not resolve to ${expected} on npm`);
}

export async function promoteLatest(version, run = npm, wait = pause) {
  if (!versionPattern.test(version)) throw new Error(`Invalid release version: ${version}`);

  for (const name of packages) {
    await expectRegistryValue(
      ["view", `${name}@${version}`, "version", "--json", "--prefer-online"],
      version,
      run,
      wait,
      `${name}@${version}`,
    );
  }

  for (const name of packages) {
    run(["dist-tag", "add", `${name}@${version}`, "latest"]);
    await expectRegistryValue(
      ["view", name, "dist-tags.latest", "--json", "--prefer-online"],
      version,
      run,
      wait,
      `${name} latest`,
    );
    console.log(`promote-latest: ${name}@${version} is latest`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  promoteLatest(process.argv[2]).catch((error) => {
    process.stderr.write(`promote-latest: ${error.message}\n`);
    process.exitCode = 1;
  });
}
