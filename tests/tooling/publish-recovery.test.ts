import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const workflow = readFileSync(
  new URL("../../.github/workflows/publish.yml", import.meta.url),
  "utf8",
);

const jobs = ["bindings", "bindings-musl", "publish", "promote", "release"];

const job = (name: string): string => {
  const start = workflow.indexOf(`\n  ${name}:`);
  const next = jobs.find((candidate) => workflow.indexOf(`\n  ${candidate}:`, start + 1) > start);

  return workflow.slice(start, next ? workflow.indexOf(`\n  ${next}:`, start + 1) : undefined);
};

test("manual recovery skips native builds and publishing", () => {
  for (const name of ["bindings", "bindings-musl", "publish"]) {
    expect(job(name), name).toContain("if: ${{ github.event_name == 'push' }}");
  }

  const recovery = job("promote");
  expect(recovery).toContain("if: ${{ github.event_name == 'workflow_dispatch' }}");
  expect(recovery).not.toContain("napi-zig publish");
  expect(recovery).not.toContain("stage:publish");
  expect(recovery).not.toContain("build-bindings");
  expect(workflow).toContain("group: publish-${{ github.ref }}");
});

test("manual recovery uses OIDC and the same promotion script as tag publishing", () => {
  const recovery = job("promote");

  for (const required of [
    "id-token: write",
    "name: npm",
    "pnpm add -g npm@12.2.0",
    "VERSION: ${{ inputs.version }}",
    'node scripts/promote-latest.mjs "$VERSION"',
  ]) {
    expect(recovery).toContain(required);
  }

  expect(job("publish")).toContain('node scripts/promote-latest.mjs "${TAG#v}"');
  expect(recovery).not.toContain("NPM_TOKEN");
});
