import type { ImplementationId } from "../echo/echo-types.ts";
import { BASELINE_ID } from "../echo/echo-types.ts";
import type { ConfigurationResult } from "./summary.ts";
import { humanBytes } from "./units.ts";

const MISSING = "n/a";

const fixed = (value: number, digits: number): string => value.toFixed(digits);

const integer = (value: number | null): string =>
  value === null ? MISSING : Math.round(value).toLocaleString("en-US");

const legCell = (value: number | null, render: (input: number) => string): string =>
  value === null ? MISSING : render(value);

export const ratioAgainstBaseline = (result: ConfigurationResult, id: ImplementationId): string => {
  const baseline = result.legs[BASELINE_ID].medianRoundTripsPerSecond;
  const leg = result.legs[id].medianRoundTripsPerSecond;
  if (baseline === null || leg === null) return MISSING;
  return (leg / baseline).toFixed(3);
};

const latencyCell = (result: ConfigurationResult, id: ImplementationId): string => {
  const seconds = result.legs[id].medianSeconds;
  if (seconds === null) return MISSING;
  return `${fixed((seconds / result.messages) * 1e6, 2)} µs`;
};

const rowOf = (result: ConfigurationResult, id: ImplementationId): string =>
  [
    humanBytes(result.payloadBytes),
    id,
    legCell(result.legs[id].medianSeconds, (value) => fixed(value, 4)),
    integer(result.legs[id].medianRoundTripsPerSecond),
    latencyCell(result, id),
    legCell(result.legs[id].medianWireBytesPerSecond, (value) => `${humanBytes(value)}/s`),
    legCell(result.legs[id].medianCpuSeconds, (value) => `${fixed(value, 3)} s`),
    legCell(result.legs[id].medianPeakRssBytes, humanBytes),
    ratioAgainstBaseline(result, id),
  ].join(" | ");

/// One row per payload and implementation: the long form stays readable at five
/// legs, where a column per implementation would triple the table's width. CPU
/// and peak RSS belong to the worker process, which runs the echo server and
/// client together; only the Socket.IO leg uses a different client.
export const table = (
  results: readonly ConfigurationResult[],
  implementations: readonly ImplementationId[],
): readonly string[] => [
  "",
  "| payload | implementation | median s | round trips/s | mean rt | wire | cpu | peak rss | vs ws |",
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ...results.flatMap((result) => implementations.map((id) => `| ${rowOf(result, id)} |`)),
];
