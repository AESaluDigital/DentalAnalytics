/**
 * Postgres local para desenvolvimento (sem instalar nada no sistema).
 * Lê usuário, senha, porta e banco do DATABASE_URL do .env.
 * Uso: npm run db:dev   (deixe rodando; Ctrl+C para parar)
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import EmbeddedPostgres from "embedded-postgres";

async function main() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL não definido no .env");
  const url = new URL(raw);
  if (!["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new Error("db:dev só sobe banco local; DATABASE_URL aponta para outro host.");
  }

  const dir = resolve(process.cwd(), ".pgdata");
  const dbName = url.pathname.replace(/^\//, "") || "dashboard";
  const pg = new EmbeddedPostgres({
    databaseDir: dir,
    user: decodeURIComponent(url.username || "postgres"),
    password: decodeURIComponent(url.password || "postgres"),
    port: Number(url.port || 5432),
    persistent: true,
  });

  if (!existsSync(dir)) await pg.initialise();
  await pg.start();
  try {
    await pg.createDatabase(dbName);
    console.log(`Banco "${dbName}" criado.`);
  } catch {
    // já existe
  }
  console.log(`Postgres local rodando na porta ${url.port || 5432} (dados em .pgdata). Ctrl+C para parar.`);

  const stop = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
