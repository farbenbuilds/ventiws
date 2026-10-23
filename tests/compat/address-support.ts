import type { AddressInfo } from "node:net";

/// The port behind an `address()`, for the `port: 0` servers these suites start.
export function boundPort(address: AddressInfo | string | null): number {
  // SAFETY: every fixture here binds a TCP port, so a listening server reports an
  // AddressInfo. The string form is a pipe path, which none of these harnesses use.
  const info = address as AddressInfo | null;

  return info?.port ?? 0;
}
