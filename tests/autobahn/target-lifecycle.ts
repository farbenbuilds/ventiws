import { loadVentiwsAddon } from "./target-runtime.ts";
import type { EngineEvent, EchoState } from "./target-runtime.ts";
import { pack, purge, reply } from "./target-runtime.ts";

const FINALIZE_ATTEMPTS = 6;

/// Target state is the echo state plus the two fields the shutdown sequence has
/// to observe. The engine owns the listener and reports its own progress.
export type TargetState = EchoState & {
  closing: boolean;
  exited: boolean;
};

/// Releases native resources. `finalizeServer` refuses while a dispatch is still
/// queued, and the `serverClosed` callback runs inside the drain, so the current
/// tick has to finish first.
function finalize(state: TargetState, remaining: number): void {
  if (state.exited) return;

  try {
    loadVentiwsAddon().finalizeServer(state.handle);
  } catch (error) {
    if (remaining > 0) {
      setImmediate(() => {
        finalize(state, remaining - 1);
      });

      return;
    }

    const detail = error instanceof Error ? error.message : String(error);

    process.stderr.write(`finalize failed: ${detail}\n`);
    process.exit(1);
  }

  state.exited = true;
  process.exit(0);
}

function onServerClosed(state: TargetState): void {
  if (state.exited) return;
  setImmediate(() => {
    finalize(state, FINALIZE_ATTEMPTS);
  });
}

export function requestClose(state: TargetState): void {
  if (state.closing) return;
  state.closing = true;
  loadVentiwsAddon().closeServer(state.handle);
}

function onEngineError(state: TargetState): void {
  if (state.exited) return;
  state.exited = true;
  process.stderr.write("engine reported a fatal error\n");
  process.exit(1);
}

/// The event vocabulary is matched exhaustively, so a new engine event is a
/// compile-visible omission rather than a silent no-op.
export function onEvent(
  state: TargetState,
  event: EngineEvent,
  announce: (port: number) => void,
): void {
  switch (event.kind) {
    case "listening":
      announce(event.code);

      return;
    case "connectionOpen":
      state.connection = pack(event.index, event.generation);

      return;
    case "connectionMessage":
      reply(loadVentiwsAddon(), state);

      return;
    case "connectionClose":
      purge(loadVentiwsAddon(), state, event.index, event.generation);

      return;
    case "engineError":
      onEngineError(state);

      return;
    case "serverClosed":
      onServerClosed(state);

      return;
  }
}
