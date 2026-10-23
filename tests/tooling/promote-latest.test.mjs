import { expect, test, vi } from "vitest";
import { promoteLatest } from "../../scripts/promote-latest.mjs";

const version = "1.0.0-rc.5";

const bindings = [
  "@ventiws/binding-linux-x64-gnu",
  "@ventiws/binding-linux-arm64-gnu",
  "@ventiws/binding-linux-x64-musl",
  "@ventiws/binding-darwin-x64",
  "@ventiws/binding-darwin-arm64",
];

const names = [...bindings, "ventiws"];

function registry(missing) {
  const calls = [];
  const tags = new Map();

  const run = (args) => {
    calls.push(args);

    if (args[0] === "dist-tag") {
      const [name] = args[2].split(`@${version}`);
      tags.set(name, version);

      return "";
    }

    if (args[2] === "dist-tags.latest") return JSON.stringify(tags.get(args[1]) ?? "1.0.0-alpha.1");

    return JSON.stringify(args[1] === `${missing}@${version}` ? "1.0.0-alpha.1" : version);
  };

  return { calls, run, tags };
}

test("promotes all five bindings before ventiws after preflighting all six versions", async () => {
  const { calls, run, tags } = registry();
  const log = vi.spyOn(console, "log").mockImplementation(() => {});

  try {
    await promoteLatest(version, run, async () => {});
  } finally {
    log.mockRestore();
  }

  expect(calls.slice(0, 6)).toEqual(
    names.map((name) => ["view", `${name}@${version}`, "version", "--json", "--prefer-online"]),
  );
  expect(calls.filter(([command]) => command === "dist-tag")).toEqual(
    names.map((name) => ["dist-tag", "add", `${name}@${version}`, "latest"]),
  );
  expect(calls.slice(6).filter(([command]) => command === "view")).toEqual(
    names.map((name) => ["view", name, "dist-tags.latest", "--json", "--prefer-online"]),
  );
  expect([...tags.keys()]).toEqual(names);
});

test("missing platform version stops before changing any dist-tag", async () => {
  const { calls, run } = registry(bindings[2]);
  await expect(promoteLatest(version, run, async () => {})).rejects.toThrow(bindings[2]);
  expect(calls.some(([command]) => command === "dist-tag")).toBe(false);
});

test("untrusted version input never reaches npm", async () => {
  const { calls, run } = registry();
  await expect(promoteLatest("1.0.0; echo injected", run)).rejects.toThrow(
    "Invalid release version",
  );
  expect(calls).toEqual([]);
});

test("an unconfirmed binding tag stops before moving ventiws", async () => {
  const { calls, run } = registry();

  const stale = (args) => {
    if (args[1] === bindings[1] && args[2] === "dist-tags.latest") {
      calls.push(args);

      return JSON.stringify("1.0.0-alpha.1");
    }

    return run(args);
  };

  const log = vi.spyOn(console, "log").mockImplementation(() => {});

  try {
    await expect(promoteLatest(version, stale, async () => {})).rejects.toThrow(bindings[1]);
  } finally {
    log.mockRestore();
  }

  expect(calls).not.toContainEqual(["dist-tag", "add", `ventiws@${version}`, "latest"]);
});
