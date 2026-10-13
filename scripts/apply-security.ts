import { readFile } from "node:fs/promises";
import { config } from "dotenv";
import postgres from "postgres";

config({ path: [".env.local", ".env"], quiet: true });

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured.");
  const client = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
  try {
    const sql = await readFile("supabase/security.sql", "utf8");
    await client.begin(tx => tx.unsafe(sql));
    console.log("Supabase policies, immutable-history protection, and publication configured.");
  } catch { throw new Error("Security setup failed. Check that the migrations were applied to Supabase PostgreSQL."); }
  finally { await client.end(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
