import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const stageScript = fileURLToPath(new URL("../../scripts/stage-publish.mjs", import.meta.url));

const { platforms }: { platforms: string[] } = JSON.parse(
  readFileSync(new URL("../../src/builds/platforms.json", import.meta.url), "utf8"),
);

test("every binding ships the root README, including the packed tarball", () => {
  const root = mkdtempSync(join(tmpdir(), "ventiws-publish-readme-"));
  const stage = join(root, "npm", "ventiws");
  const readme = "# ventiws release README\n";

  try {
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "ventiws", version: "9.9.9" }),
    );
    writeFileSync(join(root, "README.md"), readme);
    writeFileSync(join(root, "LICENSE"), "MIT\n");
    mkdirSync(join(root, "dist"));
    mkdirSync(join(stage, "@ventiws"), { recursive: true });
    writeFileSync(join(stage, "package.json"), "{}");

    for (const platform of platforms) {
      const binding = join(stage, "@ventiws", `binding-${platform}`);
      mkdirSync(binding);
      writeFileSync(
        join(binding, "package.json"),
        JSON.stringify({ name: `@ventiws/binding-${platform}`, files: ["ventiws.node"] }),
      );
      writeFileSync(join(binding, "ventiws.node"), "test addon");
    }

    expect(spawnSync(process.execPath, [stageScript], { cwd: root }).status).toBe(0);

    for (const platform of platforms)
      expect(
        readFileSync(join(stage, "@ventiws", `binding-${platform}`, "README.md"), "utf8"),
      ).toBe(readme);

    const binding = join(stage, "@ventiws", `binding-${platforms[0]}`);
    expect(spawnSync("pnpm", ["pack", "--pack-destination", root], { cwd: binding }).status).toBe(
      0,
    );

    const tarball = readdirSync(root).find((file) => file.endsWith(".tgz")) ?? "";

    const packed = spawnSync("tar", ["-xOzf", join(root, tarball), "package/README.md"], {
      encoding: "utf8",
    });

    expect(packed.status).toBe(0);
    expect(packed.stdout).toBe(readme);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
