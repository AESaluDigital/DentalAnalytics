import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import { pgSsl } from "./pg-ssl";

/**
 * Aplica db/schema.sql (idempotente).
 *   npm run db:migrate            → banco do DATABASE_URL (local)
 *   npm run db:migrate:supabase   → banco compartilhado do Supabase (SUPABASE_DATABASE_URL)
 */
async function main() {
  const supabase = process.argv.includes("--supabase");
  const name = supabase ? "SUPABASE_DATABASE_URL" : "DATABASE_URL";
  const url = process.env[name];
  if (!url) throw new Error(`${name} não definido no .env`);

  const sql = readFileSync(resolve(process.cwd(), "db/schema.sql"), "utf8");
  const client = new Client({
    connectionString: url,
    // Supabase exige SSL; o certificado é aceito sem validar a cadeia ("no-verify").
    ssl: supabase ? pgSsl(process.env.SUPABASE_DATABASE_SSL ?? "no-verify") : pgSsl(),
  });

  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log(`Schema aplicado com sucesso${supabase ? " no Supabase" : ""}.`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
