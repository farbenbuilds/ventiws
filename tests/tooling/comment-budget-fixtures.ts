import { commentViolations } from "../../scripts/comment-budget.mjs";

export function violationsOf(source: string, name = "sample.ts"): string[] {
  const violations: string[] = [];
  commentViolations(name, source, violations);

  return violations;
}

/// `code` code lines, each preceded by a burst of `per` comment lines. Bursts stay
/// under the run cap on purpose, so a test can exercise the ratio without also tripping
/// the run check and passing for the wrong reason.
export function burst(code: number, per: number): string {
  const lines: string[] = [];

  for (let i = 0; i < code; i += 1) {
    for (let c = 0; c < per; c += 1) lines.push(`// why ${i}.${c}`);
    lines.push(`const v${i} = ${i};`);
  }

  return lines.join("\n");
}
