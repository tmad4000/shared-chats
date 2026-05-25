import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

function init() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set at runtime");
  }

  const globalForPg = globalThis as unknown as { _pg?: postgres.Sql };
  let client = globalForPg._pg;

  if (!client) {
    // Cloud SQL unix-socket form: postgresql://user:pass@/db?host=/cloudsql/...
    // Node's URL parser rejects this (no hostname), so detect + pass options object instead.
    const socketMatch = connectionString.match(
      /^postgres(?:ql)?:\/\/([^:@]+):([^@]+)@\/([^?]+)\?host=(.+)$/,
    );
    if (socketMatch) {
      const [, user, password, database, host] = socketMatch;
      client = postgres({
        host: decodeURIComponent(host),
        user: decodeURIComponent(user),
        password: decodeURIComponent(password),
        database: decodeURIComponent(database),
        max: 5,
        idle_timeout: 30,
        prepare: false,
      });
    } else {
      // Standard TCP form (works for local dev with public IP)
      client = postgres(connectionString, {
        max: 5,
        idle_timeout: 30,
        prepare: false,
      });
    }
    if (process.env.NODE_ENV !== "production") globalForPg._pg = client;
  }

  return drizzle(client, { schema });
}

export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop) {
    if (!_db) _db = init();
    const value = (_db as unknown as Record<string | symbol, unknown>)[prop as string];
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(_db) : value;
  },
});

export type DB = ReturnType<typeof drizzle<typeof schema>>;
