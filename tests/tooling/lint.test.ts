// The lint gate has three copies that must agree: the config that enables the vendored
// anti-slop rules, the pinned fork, and the local rules that ban OOP, enums, and emoji.
// Each is checked where it is declared, because a rule nobody enabled is a rule nobody has.

import { existsSync, readFileSync } from "node:fs";

import { RuleTester } from "oxlint/plugins-dev";
import { describe, expect, it, test } from "vitest";
import plugin from "../../scripts/oxlint-plugin.mjs";

type LintConfig = {
  readonly jsPlugins: readonly (string | { readonly name: string; readonly specifier: string })[];
  readonly rules: Readonly<Record<string, string>>;
};

type PackageManifest = {
  readonly devDependencies: Readonly<Record<string, string>>;
};

const readConfig = (): LintConfig => {
  // SAFETY: the checked-in JSON is the lint configuration the assertions below describe.
  return JSON.parse(readFileSync(".oxlintrc.json", "utf8")) as LintConfig;
};

const readManifest = (): PackageManifest => {
  // SAFETY: package.json is checked-in manifest data read only for the version pair.
  return JSON.parse(readFileSync("package.json", "utf8")) as PackageManifest;
};

test("every anti-slop rule is enforced at error and registered under its own name", () => {
  const config = readConfig();
  const rules = Object.entries(config.rules).filter(([name]) => name.startsWith("anti-slop/"));

  expect(rules).toHaveLength(18);
  expect(rules.every(([, severity]) => severity === "error")).toBe(true);
  expect(config.rules["oxc/no-accumulating-spread"]).toBe("error");
  expect(config.jsPlugins).toContainEqual({
    name: "anti-slop",
    specifier: "./tools/oxlint/anti-slop/index.ts",
  });
  const dependencies = readManifest().devDependencies;
  expect(dependencies["@oxlint/plugins"]).toBe(dependencies.oxlint.replace(/^[^0-9]*/, ""));
});

test("the napi-zig fork is pinned by tag and commit and documented", () => {
  expect(readFileSync("build.zig.zon", "utf8")).toContain(
    "github.com/farbenbuilds/napi-zig?ref=v0.3.1-ventiws.1#",
  );
  expect(existsSync("docs/forks.md")).toBe(true);
  const policy = readFileSync("docs/forks.md", "utf8");
  expect(policy).toContain("yuku-toolchain/napi-zig");
  expect(policy).toContain("options.optimize");
  expect(policy).toContain("v0.3.1-ventiws.1");
});

RuleTester.describe = describe;

RuleTester.it = it;

const ruleTester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } });
const rules = plugin.rules;

ruleTester.run("no-oop", rules["no-oop"], {
  valid: ["export function ok(): number { return 1 }"],
  invalid: [
    {
      code: "class A {}",
      errors: [{ message: "Classes are banned; return a state record from a factory function." }],
    },
    {
      code: "const B = class {}",
      errors: [
        {
          message: "Class expressions are banned; return a state record from a factory function.",
        },
      ],
    },
    {
      code: "export function f(): unknown { return this }",
      errors: [{ message: "`this` is banned; pass state to free functions explicitly." }],
    },
    {
      code: "Object.prototype.polluted = 1",
      errors: [{ message: "Prototype mutation is banned." }],
    },
    {
      code: "Object.setPrototypeOf({}, null)",
      errors: [{ message: "Prototype mutation is banned." }],
    },
  ],
});

ruleTester.run("no-enum", rules["no-enum"], {
  valid: ["export const COLOURS = ['red'] as const"],
  invalid: [
    {
      code: "enum Colour { Red }",
      errors: [{ message: "Enums are banned; use `as const` unions." }],
    },
  ],
});

const rocket = String.fromCodePoint(0x1f680);

ruleTester.run("no-emoji", rules["no-emoji"], {
  valid: ["export const name = 'rocket'"],
  invalid: [
    {
      code: `export const name = '${rocket}'`,
      errors: [{ message: "Emoji code points are banned in code, comments, and strings." }],
    },
  ],
});
