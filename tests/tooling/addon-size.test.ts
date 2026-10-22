import { existsSync, statSync } from "node:fs";

import { expect, test } from "vitest";

/// Host ceilings with deliberate headroom over the codec-only public addon.
/// `tests/tooling/release-build-mode.test.ts` holds the release mode; this guard
/// catches a build-graph change that pulls the engine, BoringSSL, or lsquic back in.
const ceilings = new Map<string, number>([["linux-x64", 600_000]]);

test("the host addon stays under its target-specific size ceiling", () => {
  const artifact = "zig-out/lib/ventiws.node";

  if (!existsSync(artifact)) return;

  const ceiling = ceilings.get(`${process.platform}-${process.arch}`);

  if (ceiling === undefined) return;

  expect(statSync(artifact).size).toBeLessThanOrEqual(ceiling);
});
