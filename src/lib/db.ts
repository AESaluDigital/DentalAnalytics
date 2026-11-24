import "server-only";
import { Pool, types, type QueryResultRow } from "pg";
import { env } from "./env";

// Colunas DATE voltam como "YYYY-MM-DD" (evita deslocamento de fuso).
types.setTypeParser(1082, (v: string) => v);

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

function pool(): Pool {
  if (!globalThis.__pgPool) {
    const e = env();
    globalThis.__pgPool = new Pool({
      connectionString: e.DATABASE_URL,
      ssl: e.DATABASE_SSL === "false" ? undefined : { rejectUnauthorized: e.DATABASE_SSL === "true" },
      max: process.env.VERCEL ? 2 : 10,
    });
  }
  return globalThis.__pgPool;
}

export async function query<T = QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool().query(text, params);
  return res.rows as T[];
}

/**
 * Garante as mudanças de banco das versões recentes (mesmo SQL idempotente do db/schema.sql).
 * Roda uma vez por processo: o site funciona mesmo que o schema ainda não tenha sido aplicado no Supabase.
 */
let schemaReady: Promise<void> | undefined;
export function ensureSchema(): Promise<void> {
  schemaReady ??= (async () => {
    // Só mexe no banco se algo estiver faltando: "ALTER TABLE ... IF NOT EXISTS" pede bloqueio EXCLUSIVO
    // da tabela mesmo quando a coluna já existe, e vários servidores ligando juntos travavam o login.
    let missing: { cols: string[]; tables: string[] };
    try {
      const rows = await query<{ kind: string; name: string }>(
        `SELECT 'col' AS kind, column_name AS name FROM information_schema.columns
           WHERE table_schema = current_schema() AND table_name = 'users' AND column_name IN ('permissions', 'pending')
         UNION ALL
         SELECT 'table', table_name FROM information_schema.tables
           WHERE table_schema = current_schema() AND table_name IN ('sellbot_connections', 'client_budgets')`,
      );
      const have = new Set(rows.map((r) => `${r.kind}:${r.name}`));
      missing = {
        cols: ["permissions", "pending"].filter((c) => !have.has(`col:${c}`)),
        tables: ["sellbot_connections", "client_budgets"].filter((t) => !have.has(`table:${t}`)),
      };
    } catch (err) {
      console.error("[db] não foi possível verificar o schema", err);
      return;
    }
    if (!missing.cols.length && !missing.tables.length) return;

    let client: import("pg").PoolClient;
    try {
      client = await pool().connect();
    } catch (err) {
      console.error("[db] sem conexão para ajustar o schema", err);
      schemaReady = undefined;
      return;
    }
    try {
      // Nunca segurar o site esperando bloqueio: se demorar, tenta de novo num próximo acesso.
      await client.query("SET lock_timeout = '3s'");
      if (missing.cols.includes("permissions")) await client.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions TEXT[]");
      if (missing.cols.includes("pending")) await client.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS pending BOOLEAN NOT NULL DEFAULT FALSE");
      if (missing.tables.includes("sellbot_connections")) await client.query(`CREATE TABLE IF NOT EXISTS sellbot_connections (
        client_id INTEGER PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
        token_encrypted TEXT NOT NULL,
        global_pipelines TEXT[],
        connected_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        connected_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
      if (missing.tables.includes("client_budgets")) await client.query(`CREATE TABLE IF NOT EXISTS client_budgets (
        client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        month DATE NOT NULL,
        platform TEXT NOT NULL CHECK (platform IN ('meta', 'google', 'total')),
        amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
        updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (client_id, month, platform))`);
    } catch (err) {
      console.error("[db] não foi possível garantir o schema", err);
      schemaReady = undefined; // tenta de novo no próximo acesso
    } finally {
      await client.query("RESET lock_timeout").catch(() => undefined);
      client.release();
    }
  })();
  return schemaReady;
}

/** Nome antigo, mantido por compatibilidade. */
export const ensureUserColumns = ensureSchema;

export async function queryOne<T = QueryResultRow>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
