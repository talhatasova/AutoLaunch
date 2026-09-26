import { describe, expect, it } from "vitest";
import {
  SessionModeRequiredError,
  assertSessionModeDatabaseUrl,
  loadEnv,
  safeDatabaseTarget,
} from "../env";

/**
 * The three-second version of a three-hour debug.
 *
 * On Supabase's transaction pooler (6543) pg-boss's prepared statements and advisory locks
 * break, and the only symptom is jobs that enqueue and never run. No error, no crash.
 */
describe("session-mode DATABASE_URL assertion", () => {
  it("REFUSES the transaction pooler on 6543", () => {
    const url = "postgresql://postgres.ref:pw@aws-0-eu-west-2.pooler.supabase.com:6543/postgres";
    expect(() => assertSessionModeDatabaseUrl(url)).toThrow(SessionModeRequiredError);
  });

  it("explains the actual symptom, not just the rule", () => {
    try {
      assertSessionModeDatabaseUrl("postgresql://u:p@host:6543/postgres");
      throw new Error("should have thrown");
    } catch (e) {
      const message = (e as Error).message;
      expect(message).toMatch(/never run/i);
      expect(message).toMatch(/5432/);
      expect(message).toMatch(/adr\/0001-job-queue/i);
    }
  });

  it("accepts the direct connection on 5432", () => {
    expect(
      assertSessionModeDatabaseUrl("postgresql://postgres:pw@db.ref.supabase.co:5432/postgres"),
    ).toBe(5432);
  });

  it("accepts the session pooler on 5432", () => {
    expect(
      assertSessionModeDatabaseUrl(
        "postgresql://postgres.ref:pw@aws-0-eu-west-2.pooler.supabase.com:5432/postgres",
      ),
    ).toBe(5432);
  });

  it("treats an omitted port as the Postgres default of 5432", () => {
    expect(assertSessionModeDatabaseUrl("postgres://u:p@db.example.com/postgres")).toBe(5432);
  });

  it("rejects a non-Postgres URL rather than guessing", () => {
    expect(() => assertSessionModeDatabaseUrl("https://db.example.com:5432")).toThrow(
      /not a usable Postgres URL/,
    );
    expect(() => assertSessionModeDatabaseUrl("not a url")).toThrow(/not a usable Postgres URL/);
  });
});

describe("loadEnv", () => {
  const valid = {
    DATABASE_URL: "postgresql://postgres:pw@db.ref.supabase.co:5432/postgres",
    NEXT_PUBLIC_SUPABASE_URL: "https://ref.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  };

  it("loads a valid environment and defaults an honest User-Agent", () => {
    const env = loadEnv(valid as NodeJS.ProcessEnv);
    expect(env.databasePort).toBe(5432);
    // Identifies us and gives site owners somewhere to complain.
    expect(env.SCRAPER_USER_AGENT).toMatch(/DirectoryLaunch/);
    expect(env.SCRAPER_USER_AGENT).toMatch(/https?:\/\//);
  });

  it("fails on the pooler port even when everything else is valid", () => {
    expect(() =>
      loadEnv({ ...valid, DATABASE_URL: "postgresql://u:p@h:6543/postgres" } as NodeJS.ProcessEnv),
    ).toThrow(SessionModeRequiredError);
  });

  it("names every missing variable at once", () => {
    expect(() => loadEnv({} as NodeJS.ProcessEnv)).toThrow(/DATABASE_URL/);
  });
});

describe("safeDatabaseTarget", () => {
  it("never leaks the password into a log line", () => {
    const target = safeDatabaseTarget("postgresql://postgres:sup3rs3cret@db.ref.supabase.co:5432/postgres");
    expect(target).toBe("db.ref.supabase.co:5432/postgres");
    expect(target).not.toContain("sup3rs3cret");
  });
});
