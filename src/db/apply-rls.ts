import fs from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");

  const sqlPath = path.join(process.cwd(), "src/db/rls.sql");
  const rlsSql = await fs.readFile(sqlPath, "utf8");
  const client = postgres(url, { max: 1, prepare: false });

  console.log("Applying RLS policies...");
  await client.unsafe(rlsSql);
  console.log("RLS policies applied.");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
