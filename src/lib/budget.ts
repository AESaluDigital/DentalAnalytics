import "server-only";
import { addDays, todayIso } from "./dates";
import { ensureSchema, query } from "./db";
import { googleAccountBudget, googleDailySpend } from "./platforms/google-ads";
import { metaAccountFunds, metaDailySpend } from "./platforms/meta";
import { PlatformError } from "./platforms/http";
import { demoGoogleAds, demoMeta } from "./platforms/demo";
import { env } from "./env";
import { previousRange } from "./dates";
import type { ClientRow } from "./types";

/**
 * Orçamento do mês atual de um cliente: gasto até hoje por plataforma, orçamento definido,
 * saldo/limite informado pela própria conta e projeção até o fim do mês.
 */

export type BudgetKey = "meta" | "google";

export interface BudgetPlatform {
  key: BudgetKey;
  label: string;
  currency: string;
  /** Gasto por dia, do dia 1 até hoje. */
  daily: { date: string; spend: number }[];
  /** Orçamento definido para o mês (null = não definido). */
  budget: number | null;
  /** Saldo/limite informado pela conta de anúncios (quando a plataforma informa). */
  account: { remaining: number | null; limit: number | null; text: string | null } | null;
  error: string | null;
}

export interface BudgetData {
  /** YYYY-MM-01 */
  month: string;
  today: string;
  daysInMonth: number;
  platforms: BudgetPlatform[];
  /** Orçamento total definido para o mês (null = usar a soma das plataformas). */
  totalBudget: number | null;
}

export function monthStart(today = todayIso()): string {
  return `${today.slice(0, 8)}01`;
}

function daysIn(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

async function budgetsOf(clientId: number, month: string): Promise<Map<string, number>> {
  await ensureSchema();
  const rows = await query<{ platform: string; amount: string }>(
    "SELECT platform, amount FROM client_budgets WHERE client_id = $1 AND month = $2",
    [clientId, month],
  );
  return new Map(rows.map((r) => [r.platform, Number(r.amount)]));
}

export async function saveBudgets(
  clientId: number,
  month: string,
  values: Partial<Record<BudgetKey | "total", number | null>>,
  userId: number,
): Promise<void> {
  await ensureSchema();
  for (const [platform, amount] of Object.entries(values)) {
    if (amount === undefined) continue;
    if (amount === null) {
      await query("DELETE FROM client_budgets WHERE client_id = $1 AND month = $2 AND platform = $3", [clientId, month, platform]);
    } else {
      await query(
        `INSERT INTO client_budgets (client_id, month, platform, amount, updated_by, updated_at)
         VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT (client_id, month, platform) DO UPDATE SET amount = EXCLUDED.amount,
           updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [clientId, month, platform, amount, userId],
      );
    }
  }
}

const message = (err: unknown, platform: string) =>
  err instanceof PlatformError ? err.message : `Erro inesperado ao consultar ${platform}.`;

export async function getBudgetData(client: ClientRow): Promise<BudgetData> {
  const today = todayIso();
  const month = monthStart(today);
  const range = { start: month, end: today };
  const budgets = await budgetsOf(client.id, month);

  const platform = async (
    key: BudgetKey,
    label: string,
    id: string | null,
    spend: (id: string) => Promise<{ currency: string; daily: { date: string; spend: number }[] }>,
    funds: (id: string) => Promise<BudgetPlatform["account"]>,
  ): Promise<BudgetPlatform | null> => {
    if (!id) return null;
    const [s, f] = await Promise.allSettled([spend(id), funds(id)]);
    return {
      key,
      label,
      currency: s.status === "fulfilled" ? s.value.currency : "BRL",
      daily: s.status === "fulfilled" ? s.value.daily : [],
      budget: budgets.get(key) ?? null,
      account: f.status === "fulfilled" ? f.value : null,
      error: s.status === "rejected" ? message(s.reason, label) : null,
    };
  };

  // Modo demonstração: números fictícios (mesmo gerador do resto do dashboard).
  if (env().DEMO_MODE === "true") {
    const prev = previousRange(range);
    const demo = (key: BudgetKey, label: string, daily: { date: string; spend: number }[]): BudgetPlatform => ({
      key, label, currency: "BRL", daily: daily.map((d) => ({ date: d.date, spend: d.spend })), budget: budgets.get(key) ?? null,
      account: key === "meta" ? { remaining: 2350, limit: 10000, text: null } : { remaining: null, limit: null, text: "Faturamento automático (cartão)" }, error: null,
    });
    return {
      month, today, daysInMonth: daysIn(month), totalBudget: budgets.get("total") ?? null,
      platforms: [
        ...(client.meta_ad_account_id ? [demo("meta", "Meta Ads", demoMeta(client.meta_ad_account_id, "lead", range, prev).daily)] : []),
        ...(client.google_ads_customer_id ? [demo("google", "Google Ads", demoGoogleAds(client.google_ads_customer_id, range, prev).daily)] : []),
      ],
    };
  }

  const list = await Promise.all([
    platform("meta", "Meta Ads", client.meta_ad_account_id, (id) => metaDailySpend(id, range), metaAccountFunds),
    platform("google", "Google Ads", client.google_ads_customer_id, (id) => googleDailySpend(id, range), googleAccountBudget),
  ]);

  return {
    month,
    today,
    daysInMonth: daysIn(month),
    platforms: list.filter((p): p is BudgetPlatform => p !== null),
    totalBudget: budgets.get("total") ?? null,
  };
}

/** Exportado para testes/uso futuro: último dia do mês (YYYY-MM-DD). */
export function monthEnd(month: string): string {
  return addDays(month, daysIn(month) - 1);
}
