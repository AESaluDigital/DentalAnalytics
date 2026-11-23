import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import { pgSsl } from "./pg-ssl";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido no .env");

  const sql = readFileSync(resolve(process.cwd(), "db/schema.sql"), "utf8");
  const client = new Client({
    connectionString: url,
    ssl: pgSsl(),
  });

  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log("Schema aplicado com sucesso.");
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
