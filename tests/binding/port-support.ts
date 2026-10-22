import { createServer as createNetServer, type AddressInfo } from "node:net";

/// Node reports a pipe path as a string; these suites bind TCP, so an object-shaped
/// address is the `AddressInfo` the caller needs.
export function addressPort(address: AddressInfo | string | null): number | undefined {
  if (address === null) return undefined;

  return address instanceof Object ? address.port : undefined;
}

function probePort(): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const port = addressPort(probe.address());

      if (port === undefined) {
        probe.close();
        resolve(undefined);

        return;
      }

      probe.close(() => resolve(port));
    });
  });
}

/// Probes a free port. Prefer `port: 0` and the reported bound port; this is
/// only for tests that must name a port before the engine binds it.
export async function freePort(): Promise<number> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const port = await probePort();

    if (port !== undefined) return port;
  }

  throw new Error("failed to probe a free port");
}

/// Occupies an ephemeral port with a plain TCP listener and reports the port
/// the kernel assigned, so no other process can win the race to it.
export function occupyPort(): Promise<{ readonly port: number; close(): Promise<void> }> {
  return new Promise((resolve, reject) => {
    const blocker = createNetServer();
    blocker.once("error", reject);
    blocker.listen(0, "127.0.0.1", () => {
      const port = addressPort(blocker.address());

      if (port === undefined) {
        blocker.close(() => reject(new Error("failed to occupy a port")));

        return;
      }

      resolve({
        port,
        close: () =>
          new Promise((done) => {
            blocker.close(() => done());
          }),
      });
    });
  });
}
