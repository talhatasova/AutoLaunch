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

export type Logger = {
  [L in Level]: (message: string, fields?: Record<string, unknown>) => void;
} & {
  /** Binds fields (job_id, submission_id, directory, request_id) to every later line. */
  child(fields: Record<string, unknown>): Logger;
};

/**
 * Never pass secrets here: no tokens, passwords, decrypted credentials, DATABASE_URL,
 * verification links, or page HTML. Log hosts, kinds, counts, and costs instead.
 */
function make(bound: Record<string, unknown>): Logger {
  const at = (level: Level) => (m: string, f?: Record<string, unknown>) => emit(level, m, { ...bound, ...f });
  return {
    debug: at("debug"), info: at("info"), warn: at("warn"), error: at("error"),
    child: (fields) => make({ ...bound, ...fields }),
  };
}

export const log = make({});

/** Errors are values here - never `String(e)` a stack away. */
export function describeError(e: unknown): { name: string; message: string; stack?: string } {
  if (e instanceof Error) {
    return { name: e.name, message: e.message, stack: e.stack };
  }
  return { name: "NonError", message: typeof e === "string" ? e : JSON.stringify(e) };
}
