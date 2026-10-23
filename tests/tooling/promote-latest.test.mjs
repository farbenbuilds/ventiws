import { expect, test, vi } from "vitest";
import { promoteLatest } from "../../scripts/promote-latest.mjs";

const fixtureVersion = "9.8.7-rc.2";
const staleVersion = "0.0.0-alpha.1";

const bindings = [
  "@ventiws/binding-linux-x64-gnu",
  "@ventiws/binding-linux-arm64-gnu",
  "@ventiws/binding-linux-x64-musl",
  "@ventiws/binding-darwin-x64",
  "@ventiws/binding-darwin-arm64",
];

const names = [...bindings, "ventiws"];

function registry(missing, read = JSON.stringify) {
  const calls = [];
  const tags = new Map();

  const run = (args) => {
    calls.push(args);

    if (args[0] === "dist-tag") {
      const [name] = args[2].split(`@${fixtureVersion}`);
      tags.set(name, fixtureVersion);

      return "";
    }

    if (args[2] === "dist-tags.latest") return read(tags.get(args[1]) ?? staleVersion, args);

    return read(args[1] === `${missing}@${fixtureVersion}` ? staleVersion : fixtureVersion, args);
  };

  return { calls, run, tags };
}

test("promotes all five bindings before ventiws after preflighting all six versions", async () => {
  const { calls, run, tags } = registry();
  const log = vi.spyOn(console, "log").mockImplementation(() => {});

  try {
    await promoteLatest(fixtureVersion, run, async () => {});
  } finally {
    log.mockRestore();
  }

  expect(calls.slice(0, 6)).toEqual(
    names.map((name) => [
      "view",
      `${name}@${fixtureVersion}`,
      "version",
      "--json",
      "--prefer-online",
    ]),
  );
  expect(calls.filter(([command]) => command === "dist-tag")).toEqual(
    names.map((name) => ["dist-tag", "add", `${name}@${fixtureVersion}`, "latest"]),
  );
  expect(calls.slice(6).filter(([command]) => command === "view")).toEqual(
    names.map((name) => ["view", name, "dist-tags.latest", "--json", "--prefer-online"]),
  );
  expect([...tags.keys()]).toEqual(names);
});

test("accepts npm 12 singleton array readbacks for versions and latest tags", async () => {
  const { calls, run, tags } = registry(undefined, (value) => JSON.stringify([value]));
  const log = vi.spyOn(console, "log").mockImplementation(() => {});

  try {
    await promoteLatest(fixtureVersion, run, async () => {});
  } finally {
    log.mockRestore();
  }

  expect(calls.filter(([command]) => command === "view")).toHaveLength(names.length * 2);
  expect([...tags.keys()]).toEqual(names);
});

test.each([
  ["empty array", "[]"],
  ["multiple values", JSON.stringify([fixtureVersion, fixtureVersion])],
  ["different value", JSON.stringify([staleVersion])],
  ["malformed JSON", "{bad"],
])("rejects %s on version and latest readbacks", async (_label, response) => {
  for (const field of ["version", "dist-tags.latest"]) {
    const { run, tags } = registry(undefined, (value, args) =>
      args[2] === field ? response : JSON.stringify([value]),
    );

    await expect(promoteLatest(fixtureVersion, run, async () => {})).rejects.toThrow(bindings[0]);
    expect(tags.size).toBe(field === "version" ? 0 : 1);
    expect(tags.has("ventiws")).toBe(false);
  }
});

test("missing platform version stops before changing any dist-tag", async () => {
  const { calls, run } = registry(bindings[2]);
  await expect(promoteLatest(fixtureVersion, run, async () => {})).rejects.toThrow(bindings[2]);
  expect(calls.some(([command]) => command === "dist-tag")).toBe(false);
});

test("untrusted version input never reaches npm", async () => {
  const { calls, run } = registry();
  await expect(promoteLatest(`${fixtureVersion}; echo injected`, run)).rejects.toThrow(
    "Invalid release version",
  );
  expect(calls).toEqual([]);
});

test("an unconfirmed binding tag stops before moving ventiws", async () => {
  const { calls, run } = registry();

  const stale = (args) => {
    if (args[1] === bindings[1] && args[2] === "dist-tags.latest") {
      calls.push(args);

      return JSON.stringify(staleVersion);
    }

    return run(args);
  };

  const log = vi.spyOn(console, "log").mockImplementation(() => {});

  try {
    await expect(promoteLatest(fixtureVersion, stale, async () => {})).rejects.toThrow(bindings[1]);
  } finally {
    log.mockRestore();
  }

  expect(calls).not.toContainEqual(["dist-tag", "add", `ventiws@${fixtureVersion}`, "latest"]);
});
