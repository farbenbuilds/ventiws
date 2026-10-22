import { takeSocketMessage } from "../../src/binding/socket";
import { expect, test } from "vitest";
import { collect, connect, opened } from "./echo-client";
import { startEcho } from "./echo-support";

const TEST_TIMEOUT_MS = 20_000;

test(
  "echoes a text message back to the peer",
  async () => {
    const echo = await startEcho();
    const client = connect(echo.port);

    try {
      await opened(client);
      const received = collect(client, 1);
      client.send("hello ventiws");
      const [reply] = await received;
      expect(reply?.bytes.toString("utf8")).toBe("hello ventiws");
      expect(reply?.isBinary).toBe(false);
      expect(echo.received).toHaveLength(1);
    } finally {
      client.close();
      await echo.dispose();
    }
  },
  TEST_TIMEOUT_MS,
);

test(
  "echoes a binary message back with the binary flag preserved",
  async () => {
    const echo = await startEcho();
    const client = connect(echo.port);

    try {
      await opened(client);
      const received = collect(client, 1);
      // Bytes that are not valid UTF-8, so a text or binary mix-up is visible.
      client.send(Buffer.from([0x00, 0xff, 0xfe, 0x01, 0x80]));
      const [reply] = await received;
      expect(reply?.bytes.toString("hex")).toBe("00fffe0180");
      expect(reply?.isBinary).toBe(true);
    } finally {
      client.close();
      await echo.dispose();
    }
  },
  TEST_TIMEOUT_MS,
);

test(
  "reports a null take once the inbound ring is drained",
  async () => {
    const echo = await startEcho();
    const client = connect(echo.port);

    try {
      await opened(client);
      const received = collect(client, 1);
      client.send("drain me");
      await received;
      expect(takeSocketMessage(echo.handle, await echo.connection())).toBeNull();
    } finally {
      client.close();
      await echo.dispose();
    }
  },
  TEST_TIMEOUT_MS,
);

test(
  "stages the reply through the ring the client received it from",
  async () => {
    const echo = await startEcho();
    const client = connect(echo.port);

    try {
      await opened(client);
      const received = collect(client, 1);
      client.send("accounted");
      await received;
      // One inbound message reached JavaScript, and its echo reached the peer,
      // so the staging ring was both written and drained exactly once.
      expect(echo.received).toHaveLength(1);
      expect(echo.received[0]?.bytes.toString("utf8")).toBe("accounted");
    } finally {
      client.close();
      await echo.dispose();
    }
  },
  TEST_TIMEOUT_MS,
);
