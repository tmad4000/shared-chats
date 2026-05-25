import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Lazy init so Next.js build-time page-data collection doesn't fail when
// DATABASE_URL isn't set in the build environment (it's only set at runtime
// via Cloud Run secret env vars). Throws on first actual query if missing.
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

function init() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set at runtime");
  }
  const globalForPg = globalThis as unknown as { _pg?: postgres.Sql };
  const client = globalForPg._pg ?? postgres(connectionString, {
    max: 5,
    idle_timeout: 30,
    prepare: false,
  });
  if (process.env.NODE_ENV !== "production") globalForPg._pg = client;
  return drizzle(client, { schema });
}

// Proxy that initializes on first property access — works with both
// `db.select(...)` and `db.insert(...)` style calls.
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop) {
    if (!_db) _db = init();
    const value = (_db as unknown as Record<string | symbol, unknown>)[prop as string];
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(_db) : value;
  },
});

export type DB = ReturnType<typeof drizzle<typeof schema>>;
