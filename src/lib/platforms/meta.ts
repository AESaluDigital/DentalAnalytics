import "server-only";
import { createHmac } from "node:crypto";
import { env } from "../env";
import { metaAccessToken } from "../integrations";
import { eachDay } from "../dates";
import type {
  AdsCampaignRow,
  AdsDailyRow,
  AdsPlatformData,
  AdsTotals,
  DateRange,
  MetaAdRow,
  MetaAdSetRow,
  MetaBreakdown,
  MetaCreative,
} from "../types";
import { PlatformError, fetchJson, num } from "./http";

/**
 * Meta Marketing API — Ads Insights
 * Docs: https://developers.facebook.com/docs/marketing-api/insights
 * GET /act_{ad_account_id}/insights
 */

interface ActionStat {
  action_type: string;
  value: string;
}

interface InsightRow {
  spend?: string;
  impressions?: string;
  reach?: string;
  inline_link_clicks?: string;
  actions?: ActionStat[];
  action_values?: ActionStat[];
  account_currency?: string;
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  date_start?: string;
}

interface InsightsResponse {
  data: InsightRow[];
  paging?: { next?: string };
}

const PLATFORM = "Meta Ads";
const MAX_PAGES = 20;

export async function metaCredentials() {
  const e = env();
  const token = await metaAccessToken();
  if (!token) {
    throw new PlatformError(PLATFORM, "Meta não conectada. Um admin deve conectar em Integrações.");
  }
  return { token, secret: e.META_APP_SECRET, version: e.META_API_VERSION };
}

export function appSecretProof(token: string, secret?: string): string | undefined {
  return secret ? createHmac("sha256", secret).update(token).digest("hex") : undefined;
}

async function insights(
  accountId: string,
  params: Record<string, string>,
): Promise<InsightRow[]> {
  const { token, secret, version } = await metaCredentials();
  const search = new URLSearchParams(params);
  const proof = appSecretProof(token, secret);
  if (proof) search.set("appsecret_proof", proof);

  let url: string | undefined =
    `https://graph.facebook.com/${version}/act_${encodeURIComponent(accountId)}/insights?${search}`;
  const rows: InsightRow[] = [];
  let pages = 0;

  while (url && pages < MAX_PAGES) {
    const res: InsightsResponse = await fetchJson<InsightsResponse>(PLATFORM, url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    rows.push(...(res.data ?? []));
    url = res.paging?.next;
    pages++;
  }
  return rows;
}

function timeRange(r: DateRange): string {
  return JSON.stringify({ since: r.start, until: r.end });
}

function actionValue(list: ActionStat[] | undefined, type: string): number {
  return num(list?.find((a) => a.action_type === type)?.value);
}

function toTotals(row: InsightRow | undefined, conversionAction: string): AdsTotals {
  return {
    spend: num(row?.spend),
    impressions: num(row?.impressions),
    clicks: num(row?.inline_link_clicks),
    reach: num(row?.reach),
    conversions: actionValue(row?.actions, conversionAction),
    conversionValue: actionValue(row?.action_values, conversionAction),
  };
}

/* ---------- Detalhamento: conjuntos → anúncios (criativos) ---------- */

const LIMIT_ADS = 300;

function metricsOf(r: InsightRow, conversionAction: string) {
  return {
    spend: num(r.spend),
    impressions: num(r.impressions),
    clicks: num(r.inline_link_clicks),
    conversions: actionValue(r.actions, conversionAction),
    conversionValue: actionValue(r.action_values, conversionAction),
  };
}

interface AdLookup {
  preview_shareable_link?: string;
  creative?: { thumbnail_url?: string; image_url?: string; title?: string; body?: string };
}

/** Prévia dos criativos (GET /?ids=…), em lotes de 50 ids. */
async function creatives(ids: string[]): Promise<Map<string, MetaCreative>> {
  const { token, secret, version } = await metaCredentials();
  const out = new Map<string, MetaCreative>();
  const proof = appSecretProof(token, secret);
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const get = async (fields: string) => {
      const q = new URLSearchParams({ ids: batch.join(","), fields });
      if (proof) q.set("appsecret_proof", proof);
      return fetchJson<Record<string, AdLookup>>(PLATFORM, `https://graph.facebook.com/${version}/?${q}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    };
    let res: Record<string, AdLookup>;
    try {
      // Miniatura maior para a prévia; se a API recusar os parâmetros, busca a padrão.
      res = await get("preview_shareable_link,creative.thumbnail_width(400).thumbnail_height(400){thumbnail_url,image_url,title,body}");
    } catch {
      res = await get("preview_shareable_link,creative{thumbnail_url,image_url,title,body}");
    }
    for (const [id, a] of Object.entries(res ?? {})) {
      out.set(id, {
        thumbnail: a.creative?.thumbnail_url ?? null,
        image: a.creative?.image_url ?? null,
        title: a.creative?.title ?? null,
        body: a.creative?.body ?? null,
        previewLink: a.preview_shareable_link ?? null,
      });
    }
  }
  return out;
}

async function fetchMetaBreakdown(accountId: string, conversionAction: string, range: DateRange): Promise<MetaBreakdown> {
  const notes: string[] = [];
  const fields = "spend,impressions,inline_link_clicks,actions,action_values";
  const soft = async (label: string, fn: () => Promise<InsightRow[]>): Promise<InsightRow[]> => {
    try {
      return await fn();
    } catch (err) {
      notes.push(`Não foi possível carregar ${label}${err instanceof PlatformError ? `: ${err.message}` : "."}`);
      return [];
    }
  };
  const [sets, ads] = await Promise.all([
    soft("os conjuntos de anúncios", () =>
      insights(accountId, { level: "adset", time_range: timeRange(range), fields: `campaign_id,adset_id,adset_name,${fields}`, sort: "spend_descending", limit: "500" }),
    ),
    soft("os anúncios", () =>
      insights(accountId, { level: "ad", time_range: timeRange(range), fields: `campaign_id,adset_id,ad_id,ad_name,${fields}`, sort: "spend_descending", limit: "500" }),
    ),
  ]);

  const withDelivery = ads.filter((a) => num(a.impressions) > 0).sort((a, b) => num(b.spend) - num(a.spend));
  const topAds = withDelivery.slice(0, LIMIT_ADS);
  if (withDelivery.length > LIMIT_ADS) notes.push(`Exibindo os ${LIMIT_ADS} anúncios com maior investimento.`);
  const previews = await creatives(topAds.map((a) => a.ad_id ?? "").filter(Boolean)).catch((err) => {
    notes.push(`Prévias dos criativos indisponíveis${err instanceof PlatformError ? `: ${err.message}` : "."}`);
    return new Map<string, MetaCreative>();
  });

  return {
    adSets: sets
      .filter((r) => num(r.impressions) > 0)
      .map<MetaAdSetRow>((r) => ({ id: r.adset_id ?? "", campaignId: r.campaign_id ?? "", name: r.adset_name ?? "(sem nome)", ...metricsOf(r, conversionAction) })),
    ads: topAds.map<MetaAdRow>((r) => ({
      id: r.ad_id ?? "",
      campaignId: r.campaign_id ?? "",
      adSetId: r.adset_id ?? "",
      name: r.ad_name ?? "(sem nome)",
      creative: previews.get(r.ad_id ?? "") ?? null,
      ...metricsOf(r, conversionAction),
    })),
    notes,
  };
}

export async function fetchMeta(
  accountId: string,
  conversionAction: string,
  range: DateRange,
  prev: DateRange,
): Promise<AdsPlatformData> {
  const totalsFields = "spend,impressions,reach,inline_link_clicks,actions,action_values,account_currency";

  const [current, previous, daily, campaigns, metaBreakdown] = await Promise.all([
    insights(accountId, { level: "account", time_range: timeRange(range), fields: totalsFields }),
    insights(accountId, { level: "account", time_range: timeRange(prev), fields: totalsFields }),
    insights(accountId, {
      level: "account",
      time_range: timeRange(range),
      time_increment: "1",
      fields: "spend,impressions,inline_link_clicks,actions",
      limit: "100",
    }),
    insights(accountId, {
      level: "campaign",
      time_range: timeRange(range),
      fields: "campaign_id,campaign_name,spend,impressions,inline_link_clicks,actions,action_values",
      sort: "spend_descending",
      limit: "100",
    }),
    fetchMetaBreakdown(accountId, conversionAction, range),
  ]);

  const byDate = new Map(daily.map((r) => [r.date_start, r]));
  const dailyRows: AdsDailyRow[] = eachDay(range).map((date) => {
    const r = byDate.get(date);
    return {
      date,
      spend: num(r?.spend),
      impressions: num(r?.impressions),
      clicks: num(r?.inline_link_clicks),
      conversions: actionValue(r?.actions, conversionAction),
    };
  });

  const campaignRows: AdsCampaignRow[] = campaigns
    .map((r) => ({
      id: r.campaign_id ?? "",
      name: r.campaign_name ?? "(sem nome)",
      spend: num(r.spend),
      impressions: num(r.impressions),
      clicks: num(r.inline_link_clicks),
      conversions: actionValue(r.actions, conversionAction),
      conversionValue: actionValue(r.action_values, conversionAction),
    }))
    .sort((a, b) => b.spend - a.spend);

  return {
    accountId,
    currency: current[0]?.account_currency ?? "BRL",
    conversionLabel: conversionAction,
    totals: toTotals(current[0], conversionAction),
    previousTotals: toTotals(previous[0], conversionAction),
    daily: dailyRows,
    campaigns: campaignRows,
    metaBreakdown,
  };
}

/* ---------- Orçamento (consultas leves) ---------- */

/** Gasto diário da conta no intervalo (para o acompanhamento de orçamento do mês). */
export async function metaDailySpend(accountId: string, range: DateRange): Promise<{ currency: string; daily: { date: string; spend: number }[] }> {
  const rows = await insights(accountId, {
    level: "account",
    time_range: timeRange(range),
    time_increment: "1",
    fields: "spend,account_currency",
    limit: "100",
  });
  const byDate = new Map(rows.map((r) => [r.date_start, num(r.spend)]));
  return {
    currency: rows[0]?.account_currency ?? "BRL",
    daily: eachDay(range).map((date) => ({ date, spend: byDate.get(date) ?? 0 })),
  };
}

/**
 * Limite de gastos e forma de pagamento da conta (Graph API: GET /act_{id}).
 * spend_cap e amount_spent vêm em centavos; spend_cap "0" = sem limite.
 */
export async function metaAccountFunds(accountId: string): Promise<{ remaining: number | null; limit: number | null; text: string | null }> {
  const { token, secret, version } = await metaCredentials();
  const q = new URLSearchParams({ fields: "spend_cap,amount_spent,funding_source_details" });
  const proof = appSecretProof(token, secret);
  if (proof) q.set("appsecret_proof", proof);
  const r = await fetchJson<{ spend_cap?: string; amount_spent?: string; funding_source_details?: { display_string?: string } }>(
    PLATFORM,
    `https://graph.facebook.com/${version}/act_${encodeURIComponent(accountId)}?${q}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const cap = num(r.spend_cap) / 100;
  const spent = num(r.amount_spent) / 100;
  return {
    limit: cap > 0 ? cap : null,
    remaining: cap > 0 ? Math.max(cap - spent, 0) : null,
    text: r.funding_source_details?.display_string ?? null,
  };
}
