// A per-connection ceiling, which one compiled capacity could not express.
//
// Split from `max-payload.test.ts`: that file measures one server's boundary, this one holds
// two servers at once and checks that a limit belongs to the server that was configured.

import { expect, test } from "vitest";
import { WebSocketServer } from "../../../src/index";
import { TEST_TIMEOUT_MS } from "../../binding/support";
import { nextSocket, openClient, upgradeHarness } from "./codec-upgrade-support";
import { byteLengthOf } from "./payload-length";

const SMALL = 1024;

test(
  "two connections in one process carry different maxPayload values",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    // The property a per-connection ceiling exists for, and the one a single compiled
    // capacity could never have: the limit belongs to the server that was configured,
    // not to the process.
    const strict = await upgradeHarness(new WebSocketServer({ noServer: true, maxPayload: SMALL }));

    const roomy = await upgradeHarness(
      new WebSocketServer({ noServer: true, maxPayload: 8 * SMALL }),
    );

    const strictAccepted = nextSocket(strict.server);
    const roomyAccepted = nextSocket(roomy.server);
    const strictClient = await openClient(strict.url);
    const roomyClient = await openClient(roomy.url);

    try {
      const strictSocket = await strictAccepted;
      const roomySocket = await roomyAccepted;
      strictSocket.on("error", () => undefined);
      const strictClosed = new Promise<number>((resolve) => strictSocket.on("close", resolve));

      const roomyDelivered = new Promise<number>((resolve) => {
        roomySocket.on("message", (data) => resolve(byteLengthOf(data)));
      });

      const payload = Buffer.alloc(4 * SMALL, "y");
      strictClient.send(payload);
      roomyClient.send(payload);
      expect(await strictClosed).toBe(1009);
      expect(await roomyDelivered).toBe(payload.length);
    } finally {
      strictClient.close();
      roomyClient.close();
      await strict.close();
      await roomy.close();
    }
  },
);
