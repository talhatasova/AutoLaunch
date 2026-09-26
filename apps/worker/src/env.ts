import { z } from "zod";

/**
 * pg-boss requires a SESSION-mode Postgres connection.
 *
 * Supabase's transaction pooler listens on 6543 and silently breaks prepared statements
 * and advisory locks - both of which pg-boss depends on. The failure signature is jobs
 * that enqueue successfully and never run: no error, no crash, submissions sit in
 * `queued` forever. See docs/adr/0001-job-queue.md.
 *
 * We refuse to boot rather than let that happen, which turns a three-hour debug into a
 * three-second one.
 */
export const TRANSACTION_POOLER_PORT = 6543;

export class SessionModeRequiredError extends Error {
  readonly code = "SESSION_MODE_REQUIRED";
  constructor(public readonly port: number) {
    super(
      [
        `DATABASE_URL points at port ${port}, which is Supabase's TRANSACTION POOLER.`,
        "",
        "pg-boss needs a SESSION-mode connection (port 5432 - direct connection or the",
        "session pooler). On the transaction pooler, prepared statements and advisory",
        "locks break and jobs enqueue but NEVER RUN - with no error and no crash.",
        "",
        "Fix: change the port in DATABASE_URL from 6543 to 5432.",
        "See docs/adr/0001-job-queue.md.",
      ].join("\n"),
    );
    this.name = "SessionModeRequiredError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class InvalidDatabaseUrlError extends Error {
  readonly code = "INVALID_DATABASE_URL";
  constructor(detail: string) {
    super(`DATABASE_URL is not a usable Postgres URL: ${detail}`);
    this.name = "InvalidDatabaseUrlError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Throws loudly on a transaction-pooler URL. Returns the resolved port otherwise.
 * A URL with no explicit port is accepted: Postgres defaults to 5432, which is correct.
 */
export function assertSessionModeDatabaseUrl(rawUrl: string): number {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new InvalidDatabaseUrlError("could not be parsed as a URL");
  }
  if (!/^postgres(ql)?:$/.test(parsed.protocol)) {
    throw new InvalidDatabaseUrlError(`unexpected protocol "${parsed.protocol}"`);
  }
  const port = parsed.port ? Number(parsed.port) : 5432;
  if (!Number.isInteger(port) || port <= 0) {
    throw new InvalidDatabaseUrlError(`unexpected port "${parsed.port}"`);
  }
  if (port === TRANSACTION_POOLER_PORT) {
    throw new SessionModeRequiredError(port);
  }
  return port;
}

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("NEXT_PUBLIC_SUPABASE_URL must be a URL"),
  /**
   * Service role. Bypasses RLS - the worker moves submission state that no client role is
   * permitted to touch. This key must NEVER appear in apps/web or be prefixed NEXT_PUBLIC_.
   */
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
  /** Honest and identifiable, with a contact URL. We are a guest on these sites. */
  SCRAPER_USER_AGENT: z
    .string()
    .min(1)
    .default("DirectoryLaunchBot/1.0 (+https://directorylaunch.app/bot)"),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
  /** Minimum gap between requests to the same host. */
  RATE_LIMIT_PER_DOMAIN_MS: z.coerce.number().int().min(0).default(5_000),
  NAVIGATION_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(30_000),
  HEADLESS: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
});

export type WorkerEnv = z.infer<typeof envSchema> & { databasePort: number };

export function loadEnv(source: NodeJS.ProcessEnv = process.env): WorkerEnv {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Worker environment is invalid:\n${detail}\n\nSee .env.example.`);
  }
  // Deliberately after schema parsing so the message is about the value, not its absence.
  const databasePort = assertSessionModeDatabaseUrl(parsed.data.DATABASE_URL);
  return { ...parsed.data, databasePort };
}

/** Redacts credentials so a boot log can safely show which host we are talking to. */
export function safeDatabaseTarget(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    return `${u.hostname}:${u.port || "5432"}${u.pathname}`;
  } catch {
    return "(unparseable)";
  }
}
