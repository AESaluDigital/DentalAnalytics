import { dec, int, money, pct } from "./format";
import { roasText, roasValue } from "./metric-cols";
import { EMPTY_ADS, adsKpis, delta, ratio, sumAds } from "./metrics";
import type { MetricKey } from "./metric-help";
import type { AdsPlatformData, AdsTotals, ReportData } from "./types";

/**
 * Modelos de relatório: cards personalizados (cada um com as métricas escolhidas) + quais seções completas aparecem.
 * Usado no editor de modelos (cliente) e no relatório (servidor) — sem dependências de servidor.
 */

export const SECTIONS = [
  { key: "analysis", label: "Resumo executivo (IA)" },
  { key: "overview", label: "Visão geral — mídia paga (gráfico e comparativo por canal)" },
  { key: "sales", label: "Vendas — CRM (funis, leads e UTMs)" },
  { key: "meta", label: "Meta Ads completo (indicadores, gráficos, campanhas e anúncios)" },
  { key: "google", label: "Google Ads completo (indicadores, gráficos, campanhas e palavras-chave)" },
  { key: "ga4", label: "Google Analytics 4 completo" },
] as const;

export type SectionKey = (typeof SECTIONS)[number]["key"];

export interface TemplateCard {
  title: string;
  /** "fonte:métrica", ex.: "ads:spend", "meta:cpa", "crm:sales". */
  metrics: string[];
}

export interface ReportLayout {
  cards: TemplateCard[];
  sections: Record<SectionKey, boolean>;
}

export const MAX_CARDS = 12;
export const MAX_METRICS_PER_CARD = 16;

export const SOURCES = [
  { key: "ads", label: "Mídia paga (Meta + Google)" },
  { key: "meta", label: "Meta Ads" },
  { key: "google", label: "Google Ads" },
  { key: "ga4", label: "Google Analytics 4" },
  { key: "crm", label: "CRM (Sellbot)" },
] as const;

type SourceKey = (typeof SOURCES)[number]["key"];

interface MetricDef {
  label: string;
  help: MetricKey;
  lowerIsBetter?: boolean;
}

const ADS_METRICS: Record<string, MetricDef> = {
  spend: { label: "Investimento", help: "spend" },
  impressions: { label: "Impressões", help: "impressions" },
  reach: { label: "Alcance", help: "reach" },
  clicks: { label: "Cliques", help: "clicks" },
  ctr: { label: "CTR", help: "ctr" },
  cpc: { label: "CPC", help: "cpc", lowerIsBetter: true },
  cpm: { label: "CPM", help: "cpm", lowerIsBetter: true },
  conversions: { label: "Conversões", help: "conversions" },
  conversionRate: { label: "Taxa de conversão", help: "conversionRate" },
  cpa: { label: "Custo por conversão", help: "cpa", lowerIsBetter: true },
  conversionValue: { label: "Valor de conversão", help: "conversionValue" },
  roas: { label: "ROAS da plataforma", help: "roas" },
};

const CATALOG: Record<SourceKey, Record<string, MetricDef>> = {
  ads: Object.fromEntries(Object.entries(ADS_METRICS).filter(([k]) => k !== "reach")),
  meta: ADS_METRICS,
  google: Object.fromEntries(Object.entries(ADS_METRICS).filter(([k]) => k !== "reach")),
  ga4: {
    sessions: { label: "Sessões", help: "sessions" },
    users: { label: "Usuários", help: "users" },
    newUsers: { label: "Novos usuários", help: "newUsers" },
    engagementRate: { label: "Taxa de engajamento", help: "engagementRate" },
    keyEvents: { label: "Eventos-chave", help: "keyEvents" },
    keyEventRate: { label: "Taxa de eventos-chave", help: "keyEventRate" },
    revenue: { label: "Receita", help: "revenue" },
  },
  crm: {
    leads: { label: "Leads no CRM", help: "crmLeads" },
    sales: { label: "Vendas", help: "sales" },
    leadToSale: { label: "Lead → venda", help: "leadToSale" },
    revenue: { label: "Faturamento", help: "salesRevenue" },
    ticket: { label: "Ticket médio", help: "ticket" },
    cpl: { label: "Custo por lead (CRM)", help: "crmCpl", lowerIsBetter: true },
    costPerSale: { label: "Custo por venda", help: "costPerSale", lowerIsBetter: true },
    roas: { label: "ROAS real (vendas)", help: "realRoas" },
  },
};

const PREFIX: Record<SourceKey, string> = { ads: "", meta: "Meta · ", google: "Google · ", ga4: "Site · ", crm: "" };

/** Todas as métricas disponíveis, agrupadas por fonte (para o editor). */
export const METRIC_OPTIONS = SOURCES.map((s) => ({
  source: s.key,
  label: s.label,
  metrics: Object.entries(CATALOG[s.key]).map(([k, d]) => ({ id: `${s.key}:${k}`, label: d.label })),
}));

export function metricDef(id: string): (MetricDef & { source: SourceKey; key: string; fullLabel: string }) | null {
  const [source, key] = id.split(":") as [SourceKey, string];
  const d = CATALOG[source]?.[key];
  return d ? { ...d, source, key, fullLabel: PREFIX[source] + d.label } : null;
}

export const DEFAULT_LAYOUT: ReportLayout = {
  cards: [
    { title: "Resultado da mídia paga", metrics: ["ads:spend", "ads:conversions", "ads:cpa", "ads:ctr", "ads:cpc"] },
  ],
  sections: { analysis: true, overview: true, sales: true, meta: true, google: true, ga4: true },
};

/** Valida e normaliza um modelo vindo do formulário ou do banco. */
export function sanitizeLayout(raw: unknown): ReportLayout | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { cards?: unknown; sections?: unknown };
  if (!Array.isArray(r.cards)) return null;
  const cards: TemplateCard[] = r.cards.slice(0, MAX_CARDS).flatMap((c) => {
    if (!c || typeof c !== "object") return [];
    const title = String((c as TemplateCard).title ?? "").trim().slice(0, 80);
    const list = Array.isArray((c as TemplateCard).metrics) ? (c as TemplateCard).metrics : [];
    const metrics = [...new Set(list.map(String).filter((m) => metricDef(m)))].slice(0, MAX_METRICS_PER_CARD);
    return metrics.length ? [{ title: title || "Indicadores", metrics }] : [];
  });
  const s = (r.sections && typeof r.sections === "object" ? r.sections : {}) as Record<string, unknown>;
  const sections = Object.fromEntries(SECTIONS.map(({ key }) => [key, s[key] !== false])) as ReportLayout["sections"];
  return { cards, sections };
}

/* ---------- valores ---------- */

export interface MetricValue {
  label: string;
  help: MetricKey;
  value: string;
  change: number | null;
  lowerIsBetter?: boolean;
}

interface AdsPair {
  cur: AdsTotals;
  prev: AdsTotals;
  currency: string;
}

function adsPair(data: ReportData, source: "ads" | "meta" | "google"): AdsPair | null {
  const list: AdsPlatformData[] = [];
  if (source !== "google" && data.meta.status === "ok") list.push(data.meta.data);
  if (source !== "meta" && data.googleAds.status === "ok") list.push(data.googleAds.data);
  if (!list.length) return null;
  return {
    cur: list.reduce((a, p) => ({ ...sumAds(a, p.totals), reach: (a.reach ?? 0) + (p.totals.reach ?? 0) }), EMPTY_ADS),
    prev: list.reduce((a, p) => ({ ...sumAds(a, p.previousTotals), reach: (a.reach ?? 0) + (p.previousTotals.reach ?? 0) }), EMPTY_ADS),
    currency: list[0].currency,
  };
}

/** [atual, anterior, formatador] de uma métrica de anúncios. */
function adsValue(p: AdsPair, key: string): [number | null, number | null, (v: number | null) => string] | null {
  const k = adsKpis(p.cur);
  const kp = adsKpis(p.prev);
  const m = (v: number | null) => money(v, p.currency);
  switch (key) {
    case "spend": return [p.cur.spend, p.prev.spend, m];
    case "impressions": return [p.cur.impressions, p.prev.impressions, int];
    case "reach": return [p.cur.reach ?? 0, p.prev.reach ?? 0, int];
    case "clicks": return [p.cur.clicks, p.prev.clicks, int];
    case "ctr": return [k.ctr, kp.ctr, (v) => pct(v, 2)];
    case "cpc": return [k.cpc, kp.cpc, m];
    case "cpm": return [k.cpm, kp.cpm, m];
    case "conversions": return [p.cur.conversions, p.prev.conversions, dec];
    case "conversionRate": return [k.conversionRate, kp.conversionRate, (v) => pct(v, 2)];
    case "cpa": return [k.cpa, kp.cpa, m];
    case "conversionValue": return [p.cur.conversionValue, p.prev.conversionValue, m];
    case "roas": return [roasValue(p.cur), roasValue(p.prev), roasText];
  }
  return null;
}

function ga4Value(data: ReportData, key: string): [number | null, number | null, (v: number | null) => string] | null {
  if (data.ga4.status !== "ok") return null;
  const t = data.ga4.data.totals;
  const p = data.ga4.data.previousTotals;
  switch (key) {
    case "sessions": return [t.sessions, p.sessions, int];
    case "users": return [t.totalUsers, p.totalUsers, int];
    case "newUsers": return [t.newUsers, p.newUsers, int];
    case "engagementRate": return [ratio(t.engagedSessions, t.sessions), ratio(p.engagedSessions, p.sessions), (v) => pct(v)];
    case "keyEvents": return [t.keyEvents, p.keyEvents, int];
    case "keyEventRate": return [ratio(t.keyEvents, t.sessions), ratio(p.keyEvents, p.sessions), (v) => pct(v, 2)];
    case "revenue": return [t.totalRevenue, p.totalRevenue, (v) => money(v)];
  }
  return null;
}

function crmValue(data: ReportData, key: string): [number | null, number | null, (v: number | null) => string] | null {
  if (data.sellbot?.status !== "ok" || data.sellbot.data.v !== 2) return null;
  const pipelines = data.sellbot.data.pipelines.filter((p) => p.inGlobal);
  const cur = { leads: 0, won: 0, value: 0 };
  const prev = { leads: 0, won: 0, value: 0 };
  for (const p of pipelines) {
    for (const e of p.entries) {
      cur.leads++;
      if (e.status === "won") {
        cur.won++;
        cur.value += e.value;
      }
    }
    prev.leads += p.prev.created;
    prev.won += p.prev.won;
    prev.value += p.prev.wonValue;
  }
  const ads = adsPair(data, "ads");
  const currency = ads?.currency ?? "BRL";
  const m = (v: number | null) => money(v, currency);
  const spend = ads?.cur.spend ?? null;
  const spendPrev = ads?.prev.spend ?? null;
  const per = (a: number | null, b: number) => (a === null ? null : ratio(a, b));
  switch (key) {
    case "leads": return [cur.leads, prev.leads, int];
    case "sales": return [cur.won, prev.won, int];
    case "leadToSale": return [ratio(cur.won, cur.leads), ratio(prev.won, prev.leads), (v) => pct(v)];
    case "revenue": return [cur.value, prev.value, m];
    case "ticket": return [ratio(cur.value, cur.won), ratio(prev.value, prev.won), m];
    case "cpl": return ads ? [per(spend, cur.leads), per(spendPrev, prev.leads), m] : null;
    case "costPerSale": return ads ? [per(spend, cur.won), per(spendPrev, prev.won), m] : null;
    case "roas": return ads ? [spend ? cur.value / spend : null, spendPrev ? prev.value / spendPrev : null, roasText] : null;
  }
  return null;
}

/** Valor de uma métrica no relatório; null quando a fonte não tem dados (o card omite a métrica). */
export function metricValue(data: ReportData, id: string): MetricValue | null {
  const d = metricDef(id);
  if (!d) return null;
  let v: ReturnType<typeof adsValue> = null;
  if (d.source === "ga4") v = ga4Value(data, d.key);
  else if (d.source === "crm") v = crmValue(data, d.key);
  else {
    const p = adsPair(data, d.source);
    if (p) v = adsValue(p, d.key);
  }
  if (!v) return null;
  const [cur, prev, fmt] = v;
  return { label: d.fullLabel, help: d.help, value: fmt(cur), change: delta(cur, prev), lowerIsBetter: d.lowerIsBetter };
}
