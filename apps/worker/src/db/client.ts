import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * The worker's only database connection: Supabase Postgres over DATABASE_URL (session
 * pooler or direct, port 5432) as a role that bypasses RLS. `submissions` grants no UPDATE
 * to client roles by design, so status transitions after enqueue belong here and nowhere else.
 * The URL carries the database password and must never reach a browser or a log line.
 */
export function createDb(url: string) {
  // prepare:false keeps us compatible if the URL is ever switched to the transaction pooler.
  const client = postgres(url, { max: 4, prepare: false, connection: { application_name: "directorylaunch-worker" } });
  return { db: drizzle(client, { schema }), close: () => client.end({ timeout: 5 }) };
}

export type Db = ReturnType<typeof createDb>["db"];
