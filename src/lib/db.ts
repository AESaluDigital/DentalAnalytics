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
 * Garante as colunas de usuários adicionadas na versão "Css, criação de contas e permissões 1.0"
 * (mesmo SQL do db/schema.sql, idempotente). Roda uma vez por processo: o site funciona mesmo que
 * o schema ainda não tenha sido aplicado no Supabase.
 */
let userColumns: Promise<void> | undefined;
export function ensureUserColumns(): Promise<void> {
  userColumns ??= (async () => {
    try {
      await pool().query("ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions TEXT[]");
      await pool().query("ALTER TABLE users ADD COLUMN IF NOT EXISTS pending BOOLEAN NOT NULL DEFAULT FALSE");
    } catch (err) {
      console.error("[db] não foi possível garantir as colunas de usuários", err);
    }
  })();
  return userColumns;
}

export async function queryOne<T = QueryResultRow>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
