import "server-only";
import { ensureSchema, query } from "./db";
import { addDays, previousRange, todayIso } from "./dates";
import { env } from "./env";
import { listSellbotConnections } from "./platforms/sellbot";
import { metaTotals } from "./platforms/meta";
import { googleTotals } from "./platforms/google-ads";
import { demoGoogleAds, demoMeta } from "./platforms/demo";
import { PlatformError } from "./platforms/http";
import { EMPTY_ADS, ratio, sumAds } from "./metrics";
import type { AdsTotals, ClientRow, DateRange } from "./types";

/**
 * Visão geral da carteira: métricas básicas de mídia (Meta + Google Ads) de todos os clientes ativos no mês,
 * comparadas com a média dos clientes e com o orçamento do mês. Consultas leves (só totais) e cache curto.
 */

export interface OverviewClient {
  id: number;
  name: string;
  platforms: { meta: boolean; google: boolean; ga4: boolean; sellbot: boolean };
  currency: string;
  totals: AdsTotals;
  /** Plataformas que falharam (as que responderam entram nos números). */
  errors: string[];
  kpis: {
    cpl: number | null;
    cpc: number | null;
    ctr: number | null;
    conversionRate: number | null;
    roas: number | null;
  };
  /** Orçamento do mês (total definido ou soma das plataformas); null = não definido. */
  budget: number | null;
  /** Quanto do orçamento já deveria ter sido investido até o fim do período (proporcional aos dias). */
  expected: number | null;
  /** Investimento ÷ esperado − 1 (ex.: 0,15 = 15% acima do ritmo do orçamento). */
  pace: number | null;
}

export interface AttentionReason {
  key: "conversion" | "cpl" | "budget" | "comment";
  text: string;
}

export interface Overview {
  month: string;
  range: DateRange;
  /** Fração do mês considerada no orçamento (1 = mês completo). */
  monthFraction: number;
  clients: OverviewClient[];
  averages: { conversionRate: number | null; cpl: number | null };
  fetchedAt: number;
}

/** Tolerância do investimento em relação ao orçamento: ±10%. */
export const BUDGET_TOLERANCE = 0.1;

const daysIn = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

/** Mês pedido (YYYY-MM) → período: do dia 1 até hoje no mês atual, mês inteiro nos anteriores. */
export function monthRange(month: string | undefined, today = todayIso()): { month: string; range: DateRange; fraction: number } {
  const current = today.slice(0, 7);
  const m = month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && month <= current ? month : current;
  const start = `${m}-01`;
  const days = daysIn(start);
  if (m === current) {
    const elapsed = Number(today.slice(8, 10));
    return { month: start, range: { start, end: today }, fraction: elapsed / days };
  }
  return { month: start, range: { start, end: addDays(start, days - 1) }, fraction: 1 };
}

const CLIENT_COLS = "id, name, meta_ad_account_id, meta_conversion_action, google_ads_customer_id, ga4_property_id, active";
const TTL_MS = 10 * 60_000;
const cache = new Map<string, { at: number; data: Promise<Overview> }>();

const errText = (err: unknown, platform: string) =>
  err instanceof PlatformError ? `${platform}: ${err.message}` : `${platform}: erro inesperado`;

async function clientRow(c: ClientRow, range: DateRange, budget: number | null, fraction: number, sellbot: boolean): Promise<OverviewClient> {
  const demo = env().DEMO_MODE === "true";
  const prev = previousRange(range);
  const errors: string[] = [];
  let currency = "BRL";
  const parts = await Promise.all([
    c.meta_ad_account_id
      ? (demo
          ? Promise.resolve({ currency: "BRL", totals: demoMeta(c.meta_ad_account_id, c.meta_conversion_action, range, prev).totals })
          : metaTotals(c.meta_ad_account_id, c.meta_conversion_action, range)
        ).catch((e) => (errors.push(errText(e, "Meta Ads")), null))
      : null,
    c.google_ads_customer_id
      ? (demo
          ? Promise.resolve({ currency: "BRL", totals: demoGoogleAds(c.google_ads_customer_id, range, prev).totals })
          : googleTotals(c.google_ads_customer_id, range)
        ).catch((e) => (errors.push(errText(e, "Google Ads")), null))
      : null,
  ]);
  let totals = { ...EMPTY_ADS };
  for (const p of parts) {
    if (!p) continue;
    const { reach: _r, ...t } = p.totals;
    totals = sumAds(totals, t);
    currency = p.currency;
  }
  const expected = budget !== null ? budget * fraction : null;
  return {
    id: c.id,
    name: c.name,
    platforms: { meta: !!c.meta_ad_account_id, google: !!c.google_ads_customer_id, ga4: !!c.ga4_property_id, sellbot },
    currency,
    totals,
    errors,
    kpis: {
      cpl: ratio(totals.spend, totals.conversions),
      cpc: ratio(totals.spend, totals.clicks),
      ctr: ratio(totals.clicks, totals.impressions),
      conversionRate: ratio(totals.conversions, totals.clicks),
      roas: ratio(totals.conversionValue, totals.spend),
    },
    budget,
    expected,
    // Com alguma plataforma sem responder o investimento está incompleto: não compara com o orçamento.
    pace: expected && expected > 0 && errors.length === 0 ? totals.spend / expected - 1 : null,
  };
}

const mean = (list: (number | null)[]) => {
  const v = list.filter((x): x is number => x !== null && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

async function build(month: string, range: DateRange, fraction: number): Promise<Overview> {
  await ensureSchema();
  const [clients, budgets, sellbot] = await Promise.all([
    query<ClientRow>(`SELECT ${CLIENT_COLS} FROM clients WHERE active ORDER BY lower(name)`),
    query<{ client_id: number; platform: string; amount: string }>(
      "SELECT client_id, platform, amount FROM client_budgets WHERE month = $1",
      [month],
    ),
    listSellbotConnections(),
  ]);
  const budgetOf = (id: number): number | null => {
    const rows = budgets.filter((b) => b.client_id === id);
    const total = rows.find((b) => b.platform === "total");
    if (total) return Number(total.amount);
    return rows.length ? rows.reduce((a, b) => a + Number(b.amount), 0) : null;
  };

  const rows = await Promise.all(clients.map((c) => clientRow(c, range, budgetOf(c.id), fraction, sellbot.has(c.id))));
  // Média simples entre os clientes que têm o indicador no período.
  const active = rows.filter((r) => r.totals.spend > 0);
  return {
    month,
    range,
    monthFraction: fraction,
    clients: rows.sort((a, b) => b.totals.spend - a.totals.spend || a.name.localeCompare(b.name, "pt-BR")),
    averages: {
      conversionRate: mean(active.map((r) => r.kpis.conversionRate)),
      cpl: mean(active.map((r) => r.kpis.cpl)),
    },
    fetchedAt: Date.now(),
  };
}

export async function getOverview(monthParam: string | undefined, force = false): Promise<Overview> {
  const { month, range, fraction } = monthRange(monthParam);
  const key = `${range.start}|${range.end}`;
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < TTL_MS) return hit.data;
  const data = build(month, range, fraction);
  cache.set(key, { at: Date.now(), data });
  if (cache.size > 24) cache.delete(cache.keys().next().value!);
  try {
    const out = await data;
    // Falhas de alguma plataforma não ficam em cache por 10 minutos.
    if (out.clients.some((c) => c.errors.length)) cache.set(key, { at: Date.now() - TTL_MS + 60_000, data });
    return out;
  } catch (err) {
    cache.delete(key);
    throw err;
  }
}

/** Motivos de atenção calculados pelas métricas (comentários em aberto entram à parte). */
export function attentionReasons(c: OverviewClient, avg: Overview["averages"], fmt: { pct: (v: number) => string; money: (v: number) => string }): AttentionReason[] {
  const out: AttentionReason[] = [];
  if (c.totals.spend > 0) {
    const cr = c.kpis.conversionRate;
    if (avg.conversionRate !== null && (cr === null || cr < avg.conversionRate)) {
      out.push({ key: "conversion", text: `% de conversão ${cr === null ? "sem dados" : fmt.pct(cr)} abaixo da média (${fmt.pct(avg.conversionRate)})` });
    }
    const cpl = c.kpis.cpl;
    if (avg.cpl !== null && (cpl === null || cpl > avg.cpl)) {
      out.push({ key: "cpl", text: cpl === null ? "Sem conversões no período (CPL indefinido)" : `CPL ${fmt.money(cpl)} acima da média (${fmt.money(avg.cpl)})` });
    }
  }
  if (c.pace !== null && Math.abs(c.pace) > BUDGET_TOLERANCE) {
    out.push({
      key: "budget",
      text: `Investimento ${fmt.pct(Math.abs(c.pace))} ${c.pace > 0 ? "acima" : "abaixo"} do orçado para o período (${fmt.money(c.totals.spend)} de ${fmt.money(c.expected ?? 0)})`,
    });
  }
  return out;
}
