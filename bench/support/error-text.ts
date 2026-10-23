/// The message of a caught cause, parsed into text because a thrown value carries no
/// contract of its own.
export const errorText = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);
