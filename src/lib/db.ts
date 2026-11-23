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

export async function queryOne<T = QueryResultRow>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
