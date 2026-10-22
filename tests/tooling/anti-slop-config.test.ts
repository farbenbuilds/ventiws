import { readFileSync } from "node:fs";

import { expect, test } from "vitest";

type LintConfig = {
  readonly jsPlugins: readonly (string | { readonly name: string; readonly specifier: string })[];
  readonly rules: Readonly<Record<string, string>>;
};

type PackageManifest = {
  readonly devDependencies: Readonly<Record<string, string>>;
};

const readConfig = (): LintConfig => {
  // SAFETY: the checked-in JSON is the lint configuration and the assertions below
  // are the contract this test cares about.
  return JSON.parse(readFileSync(".oxlintrc.json", "utf8")) as LintConfig;
};

const readManifest = (): PackageManifest => {
  // SAFETY: package.json is checked-in manifest data read only for the version pair.
  return JSON.parse(readFileSync("package.json", "utf8")) as PackageManifest;
};

test("every anti-slop rule is enforced at error", () => {
  const config = readConfig();
  const rules = Object.entries(config.rules).filter(([name]) => name.startsWith("anti-slop/"));

  expect(rules).toHaveLength(18);
  expect(rules.every(([, severity]) => severity === "error")).toBe(true);
  expect(config.rules["oxc/no-accumulating-spread"]).toBe("error");
});

test("the anti-slop plugin is registered under its own name", () => {
  expect(readConfig().jsPlugins).toContainEqual({
    name: "anti-slop",
    specifier: "./tools/oxlint/anti-slop/index.ts",
  });
});

test("the oxlint plugin package tracks the installed linter", () => {
  const dependencies = readManifest().devDependencies;
  const linter = dependencies.oxlint.replace(/^[^0-9]*/, "");

  expect(dependencies["@oxlint/plugins"]).toBe(linter);
});
