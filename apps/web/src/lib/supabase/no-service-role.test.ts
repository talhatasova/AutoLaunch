import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * An executable statement of the trust boundary.
 *
 * `apps/web` runs with the user's session and is bounded by RLS. The service
 * role key bypasses RLS entirely and belongs only to the worker. If it is ever
 * imported here - even into a file that "only runs on the server" - one
 * mistaken `NEXT_PUBLIC_` prefix, one accidental import from a client
 * component, or one error message echoing `process.env` turns the whole tenant
 * boundary off.
 *
 * A code review cannot be relied on to catch that every time. This test can.
 */

const SRC = fileURLToPath(new URL("..", import.meta.url).href).replace(/[/\\]$/, "");
const WEB_ROOT = join(SRC, "..", "..");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
      continue;
    }
    if (/\.(ts|tsx|mjs|js|jsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe("apps/web never touches the service role key", () => {
  /**
   * The single audited exception. `submissions` INSERT is revoked from `authenticated`
   * (migration 0007) so that consent_granted_at cannot be forged by a client, which means
   * exactly one server path must hold the service role. Widening this list is a security
   * decision, not a refactor.
   */
  const ALLOWED = ["src/lib/supabase/admin.ts"];

  const rel = (f: string) => relative(WEB_ROOT, f).split(sep).join("/");
  const files = sourceFiles(join(WEB_ROOT, "src"))
    .filter((f) => !f.endsWith("no-service-role.test.ts"))
    .filter((f) => !ALLOWED.includes(rel(f)));

  it("finds source files to check, so a broken glob cannot make this pass vacuously", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("keeps the service role confined to exactly one audited module", () => {
    // If admin.ts is ever deleted or renamed, this fails rather than silently
    // leaving ALLOWED pointing at nothing while a new leak goes unnoticed.
    const all = sourceFiles(join(WEB_ROOT, "src")).map(rel);
    for (const allowed of ALLOWED) expect(all).toContain(allowed);
  });

  it("does not reference SUPABASE_SERVICE_ROLE_KEY anywhere under src/", () => {
    const offenders = files.filter((file) => readFileSync(file, "utf8").includes("SUPABASE_SERVICE_ROLE_KEY"));
    expect(offenders.map((f) => relative(WEB_ROOT, f))).toEqual([]);
  });

  it("does not reference a service_role key by any of its usual spellings", () => {
    const patterns = [/service_role/i, /serviceRoleKey/, /SERVICE_ROLE/];
    const offenders = files.filter((file) => {
      const source = readFileSync(file, "utf8");
      return patterns.some((pattern) => pattern.test(source));
    });
    expect(offenders.map((f) => relative(WEB_ROOT, f))).toEqual([]);
  });

  it("does not use DATABASE_URL outside the queue module, which needs a session-mode connection", () => {
    // pg-boss enqueue is the single legitimate direct-Postgres consumer. Any
    // other use would be an unaudited path around RLS.
    const offenders = files
      .filter((file) => readFileSync(file, "utf8").includes("DATABASE_URL"))
      .map((f) => relative(WEB_ROOT, f).replace(/\\/g, "/"));
    expect(offenders).toEqual(["src/lib/queue/boss.ts"]);
  });

  it("never marks a secret-looking env var as NEXT_PUBLIC_", () => {
    const bad = /NEXT_PUBLIC_[A-Z_]*(SECRET|SERVICE|PRIVATE|PASSWORD|DATABASE)/;
    const offenders = files.filter((file) => bad.test(readFileSync(file, "utf8")));
    expect(offenders.map((f) => relative(WEB_ROOT, f))).toEqual([]);
  });
});
