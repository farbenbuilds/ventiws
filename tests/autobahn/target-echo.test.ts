import { expect, test } from "vitest";
import { echoState, reply } from "./target-echo";
import type { EchoAddon, EchoState } from "./target-echo";

type FakeOptions = {
  readonly pump?: readonly number[];
  readonly send?: readonly number[];
};

type Fake = {
  readonly addon: EchoAddon;
  readonly sent: string[];
};

function fake(options: FakeOptions = {}): Fake {
  const messages: Array<[Buffer, boolean]> = [
    [Buffer.from("one"), false],
    [Buffer.from("two"), false],
  ];

  const pump = [...(options.pump ?? [])];
  const send = [...(options.send ?? [])];
  const sent: string[] = [];

  const addon: EchoAddon = {
    pumpSocket: () => pump.shift() ?? 0,
    takeSocketMessage: () => messages.shift() ?? null,
    sendSocket: (_server, _connection, bytes) => {
      const status = send.shift() ?? 0;

      if (status === 0) sent.push(Buffer.from(bytes).toString());

      return status;
    },
  };

  return { addon, sent };
}

function connected(): EchoState {
  const state = echoState();
  state.handle = 1;
  state.connection = 2n;

  return state;
}

async function nextTick(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

test("a pump backpressure is retried and every message is echoed", async () => {
  const { addon, sent } = fake({ pump: [3, 0, 0, 0, 0] });
  const state = connected();

  reply(addon, state);

  expect(sent).toEqual([]);

  await nextTick();

  expect(sent).toEqual(["one", "two"]);
});

test("a refused send keeps the taken message for the retry", async () => {
  const { addon, sent } = fake({ send: [3, 0, 0, 0] });
  const state = connected();

  reply(addon, state);

  expect(sent).toEqual([]);

  await nextTick();

  expect(sent).toEqual(["one", "two"]);
});
