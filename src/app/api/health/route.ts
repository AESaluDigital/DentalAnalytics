import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Diagnóstico mínimo do banco: só status e códigos de erro (sem dados, sem mensagens internas). */
export async function GET() {
  const out: Record<string, unknown> = { at: new Date().toISOString() };
  const code = (err: unknown) => {
    const e = err as { code?: string; errno?: string };
    return e?.code ?? e?.errno ?? (err instanceof Error ? err.name : "desconhecido");
  };
  try {
    await query("SELECT 1");
    out.db = "ok";
  } catch (err) {
    out.db = "erro";
    out.code = code(err);
    return NextResponse.json(out, { status: 503 });
  }
  try {
    const cols = await query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'users' AND column_name IN ('permissions', 'pending')`,
    );
    const tables = await query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = current_schema() AND table_name IN ('sellbot_connections', 'client_budgets')`,
    );
    out.users_cols = cols.map((c) => c.column_name).sort();
    out.tables = tables.map((t) => t.table_name).sort();
    await query("SELECT id, email, role, permissions, active, pending FROM users LIMIT 1");
    out.users_query = "ok";
  } catch (err) {
    out.users_query = "erro";
    out.code = code(err);
  }
  return NextResponse.json(out);
}
