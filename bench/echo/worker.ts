import { errorText } from "../support/error-text.ts";
import type { EchoConfig, EchoSample } from "./echo-types.ts";
import { decodeEchoConfig } from "./echo-spec.ts";
import { unavailable } from "./echo-sample.ts";
import { resolveImplementation } from "./implementation.ts";
import { runEcho } from "./echo-run.ts";

// The parent owns the environment channel, so the spec travels through the
// environment rather than a first IPC message: the worker then starts measuring
// as soon as its module graph is loaded.
export const SPEC_ENV = "VENTIWS_BENCH_SPEC";

export type SampleMessage = {
  readonly kind: "sample";
  readonly sample: EchoSample;
};

// Every sample runs in a fresh isolate, so the worker force-exits: a socket
// aborted mid-sample keeps a handle open, and a hung child would stall the run.
// A spec the harness itself cannot decode is fatal here, and the parent turns
// the missing message into an unavailable sample.
export const runWorker = async (): Promise<void> => {
  const raw = process.env[SPEC_ENV];

  if (raw === undefined) {
    process.stderr.write("bench worker started without a spec\n");
    process.exit(1);

    return;
  }

  let config: EchoConfig;

  try {
    config = decodeEchoConfig(raw);
  } catch (error) {
    process.stderr.write(`bench worker rejected the spec: ${errorText(error)}\n`);
    process.exit(1);

    return;
  }

  let sample: EchoSample;

  try {
    const implementation = await resolveImplementation(config.implementation);
    sample = await runEcho(implementation, config);
  } catch (error) {
    process.stderr.write(`bench worker failed: ${errorText(error)}\n`);
    sample = unavailable(config, errorText(error));
  }

  const message: SampleMessage = { kind: "sample", sample };
  process.send?.(message);
  process.exit(0);
};
