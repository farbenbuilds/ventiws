// What the close frame carries, read at the peer.
//
// Split from `codec-upgrade-close.test.ts`, which covers the control-frame decisions. These
// two read the code and reason the peer actually received, which is the other half of the
// contract: the local event and the wire are separate observations.

import { expect, test } from "vitest";
import { TEST_TIMEOUT_MS } from "../../binding/support";
import { nextSocket, openClient, upgradeHarness } from "./codec-upgrade-support";

test(
  "a fractional close code truncates toward zero on the wire",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const harness = await upgradeHarness();
    const accepted = nextSocket(harness.server);
    const client = await openClient(harness.url);

    try {
      const socket = await accepted;

      const closed = new Promise<[number, string]>((resolve) => {
        client.on("close", (code, reason) => resolve([code, reason.toString()]));
      });

      socket.close(1000.5, "done");
      // `closeCodeOf` truncates before framing, so the peer reads 1000, not 1000.5.
      expect(await closed).toEqual([1000, "done"]);
    } finally {
      client.close();
      await harness.close();
    }
  },
);

test(
  "an absent close reason reaches the peer as a bare close",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const harness = await upgradeHarness();
    const accepted = nextSocket(harness.server);
    const client = await openClient(harness.url);

    try {
      const socket = await accepted;

      const closed = new Promise<[number, string]>((resolve) => {
        client.on("close", (code, reason) => resolve([code, reason.toString()]));
      });

      socket.close(1000, undefined);
      expect(await closed).toEqual([1000, ""]);
    } finally {
      client.close();
      await harness.close();
    }
  },
);
