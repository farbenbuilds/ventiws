/// Credentials across a redirect are a security property, and the one part of a hop whose
/// failure is silent: a header that was not dropped only leaks a password.

import type { OutgoingHttpHeaders, RequestOptions } from "node:http";

/// In place, because `request.ts` hands `http.request` the *same* header object it stores on
/// the handshake, so two copies would mean stripping one and sending the other.
export function stripCredentials(headers: RequestOptions["headers"]): void {
  if (!isHeaderRecord(headers)) return;

  for (const name of Object.keys(headers)) {
    const lower = name.toLowerCase();

    if (lower === "authorization" || lower === "cookie") delete headers[name];
  }
}

/// A request built by `buildRequest` always carries the object form; the array form exists
/// only in the wider `http.request` contract.
function isHeaderRecord(headers: RequestOptions["headers"]): headers is OutgoingHttpHeaders {
  return headers !== undefined && !Array.isArray(headers);
}
