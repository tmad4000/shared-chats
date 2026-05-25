// One-shot migrator. Run via: npm run db:migrate
// Reads DATABASE_URL from env; applies the generated SQL files under drizzle/.
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const client = postgres(url, { max: 1, prepare: false });
  const db = drizzle(client);
  console.log("Running migrations…");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations applied.");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
