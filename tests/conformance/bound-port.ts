import type { AddressInfo } from "node:net";

/// The address surface both `net.Server` and the `ws` servers expose.
export type Addressable = {
  address(): AddressInfo | string | null;
};

/// A bound TCP listener reports an `AddressInfo`; the string branch is a pipe
/// listener, which no conformance fixture creates, so zero is its only substitute.
export function boundPort(server: Addressable): number {
  const address = server.address();

  return address instanceof Object ? address.port : 0;
}
