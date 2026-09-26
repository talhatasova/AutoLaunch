/**
 * Structured stdout logging. Railway captures stdout, so JSON lines are queryable.
 *
 * This is an OPERATOR log only. It is explicitly NOT the user-facing record - that is
 * `submission_events`, which the dashboard reads over Realtime. Anything a user needs to
 * see must be written there as well; a log line alone is a step the user never sees.
 */
type Level = "debug" | "info" | "warn" | "error";

function emit(level: Level, message: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({
    level,
    message,
    time: new Date().toISOString(),
    ...fields,
  });
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export const log = {
  debug: (m: string, f?: Record<string, unknown>) => emit("debug", m, f),
  info: (m: string, f?: Record<string, unknown>) => emit("info", m, f),
  warn: (m: string, f?: Record<string, unknown>) => emit("warn", m, f),
  error: (m: string, f?: Record<string, unknown>) => emit("error", m, f),
};

/** Errors are values here - never `String(e)` a stack away. */
export function describeError(e: unknown): { name: string; message: string; stack?: string } {
  if (e instanceof Error) {
    return { name: e.name, message: e.message, stack: e.stack };
  }
  return { name: "NonError", message: typeof e === "string" ? e : JSON.stringify(e) };
}
