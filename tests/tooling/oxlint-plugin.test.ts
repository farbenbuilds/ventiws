import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";
import plugin from "../../scripts/oxlint-plugin.mjs";

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
