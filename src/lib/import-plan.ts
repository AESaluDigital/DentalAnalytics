import "server-only";
import { monthStart, saveBudgets } from "./budget";
import { query, queryOne } from "./db";
import type { SheetClient } from "./sheet-import";

export type ImportAction = "criar" | "atualizar" | "sem mudança" | "conflito" | "duplicado na planilha";

export interface PlannedRow extends SheetClient {
  action: ImportAction;
  /** Cliente existente que será atualizado (ou com quem conflita). */
  existing: { id: number; name: string; googleAdsId: string | null } | null;
  note: string | null;
}

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Compara a planilha com os clientes cadastrados: reconhece pelo código do Google Ads e, se não houver,
 * pelo nome (sem acentos/maiúsculas). Nunca sobrescreve um código do Google Ads diferente já vinculado.
 */
export async function planImport(rows: SheetClient[]): Promise<PlannedRow[]> {
  const existing = await query<{ id: number; name: string; google_ads_customer_id: string | null }>(
    "SELECT id, name, google_ads_customer_id FROM clients",
  );
  const byGoogle = new Map(existing.filter((c) => c.google_ads_customer_id).map((c) => [c.google_ads_customer_id as string, c]));
  const byName = new Map(existing.map((c) => [norm(c.name), c]));
  const seen = new Set<string>();

  return rows.map((r) => {
    const key = r.googleAdsId ?? `nome:${norm(r.name)}`;
    if (seen.has(key)) return { ...r, action: "duplicado na planilha", existing: null, note: "Mesmo cliente/conta já aparece acima." };
    seen.add(key);

    const match = (r.googleAdsId && byGoogle.get(r.googleAdsId)) || byName.get(norm(r.name)) || null;
    const ex = match ? { id: match.id, name: match.name, googleAdsId: match.google_ads_customer_id } : null;
    const noId = r.googleAdsId ? null : "Código do Google Ads inválido ou vazio na planilha (precisa ter 10 dígitos).";

    if (!ex) return { ...r, action: "criar", existing: null, note: noId };
    if (r.googleAdsId && ex.googleAdsId && ex.googleAdsId !== r.googleAdsId) {
      return { ...r, action: "conflito", existing: ex, note: `O cliente "${ex.name}" já está vinculado a outra conta do Google Ads; nada será alterado.` };
    }
    const linksAccount = Boolean(r.googleAdsId && !ex.googleAdsId);
    return {
      ...r,
      action: linksAccount || r.budget !== null ? "atualizar" : "sem mudança",
      existing: ex,
      note: noId,
    };
  });
}

export interface ImportResult {
  created: number;
  updated: number;
  budgets: number;
  skipped: number;
}

export async function applyImport(plan: PlannedRow[], userId: number): Promise<ImportResult> {
  const month = monthStart();
  const out: ImportResult = { created: 0, updated: 0, budgets: 0, skipped: 0 };
  for (const r of plan) {
    let clientId: number | null = null;
    if (r.action === "criar") {
      const row = await queryOne<{ id: number }>(
        "INSERT INTO clients (name, google_ads_customer_id) VALUES ($1, $2) RETURNING id",
        [r.name, r.googleAdsId],
      );
      clientId = row?.id ?? null;
      out.created++;
    } else if (r.action === "atualizar" && r.existing) {
      clientId = r.existing.id;
      if (r.googleAdsId && !r.existing.googleAdsId) {
        await query(
          "UPDATE clients SET google_ads_customer_id = $1, updated_at = now() WHERE id = $2 AND google_ads_customer_id IS NULL",
          [r.googleAdsId, clientId],
        );
      }
      out.updated++;
    } else {
      out.skipped++;
      continue;
    }
    if (clientId !== null && r.budget !== null) {
      await saveBudgets(clientId, month, { google: r.budget }, userId);
      out.budgets++;
    }
  }
  return out;
}
