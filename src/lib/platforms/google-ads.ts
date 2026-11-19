import "server-only";
import { env } from "../env";
import { eachDay } from "../dates";
import type { AdsCampaignRow, AdsDailyRow, AdsPlatformData, AdsTotals, DateRange } from "../types";
import { googleAccessToken } from "./google-oauth";
import { PlatformError, fetchJson, num } from "./http";

/**
 * Google Ads API (REST) — GoogleAdsService.Search com GAQL
 * Docs: https://developers.google.com/google-ads/api/rest/reference/rest/latest/customers.googleAds/search
 * POST https://googleads.googleapis.com/{version}/customers/{customerId}/googleAds:search
 */

interface Metrics {
  costMicros?: string;
  impressions?: string;
  clicks?: string;
  conversions?: number;
  conversionsValue?: number;
}

interface SearchRow {
  customer?: { currencyCode?: string };
  campaign?: { id?: string; name?: string };
  segments?: { date?: string };
  metrics?: Metrics;
}

interface SearchResponse {
  results?: SearchRow[];
  nextPageToken?: string;
}

const PLATFORM = "Google Ads";
const MAX_PAGES = 20;

async function search(customerId: string, query: string): Promise<SearchRow[]> {
  const e = env();
  if (!e.GOOGLE_ADS_DEVELOPER_TOKEN) {
    throw new PlatformError(PLATFORM, "GOOGLE_ADS_DEVELOPER_TOKEN não configurado no servidor.");
  }
  const token = await googleAccessToken(PLATFORM);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "developer-token": e.GOOGLE_ADS_DEVELOPER_TOKEN,
    "Content-Type": "application/json",
  };
  if (e.GOOGLE_ADS_LOGIN_CUSTOMER_ID) headers["login-customer-id"] = e.GOOGLE_ADS_LOGIN_CUSTOMER_ID;

  const url = `https://googleads.googleapis.com/${e.GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:search`;
  const rows: SearchRow[] = [];
  let pageToken: string | undefined;
  let pages = 0;

  do {
    const body: { query: string; pageToken?: string } = { query };
    if (pageToken) body.pageToken = pageToken;
    const res: SearchResponse = await fetchJson<SearchResponse>(PLATFORM, url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    rows.push(...(res.results ?? []));
    pageToken = res.nextPageToken;
    pages++;
  } while (pageToken && pages < MAX_PAGES);

  return rows;
}

function between(r: DateRange): string {
  // Datas já validadas como YYYY-MM-DD antes de chegar aqui.
  return `segments.date BETWEEN '${r.start}' AND '${r.end}'`;
}

function totalsFrom(m: Metrics | undefined): AdsTotals {
  return {
    spend: num(m?.costMicros) / 1_000_000,
    impressions: num(m?.impressions),
    clicks: num(m?.clicks),
    conversions: num(m?.conversions),
    conversionValue: num(m?.conversionsValue),
  };
}

const METRICS =
  "metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value";

export async function fetchGoogleAds(
  customerId: string,
  range: DateRange,
  prev: DateRange,
): Promise<AdsPlatformData> {
  const [daily, previous, campaigns] = await Promise.all([
    search(
      customerId,
      `SELECT customer.currency_code, segments.date, ${METRICS} FROM customer WHERE ${between(range)}`,
    ),
    search(customerId, `SELECT ${METRICS} FROM customer WHERE ${between(prev)}`),
    search(
      customerId,
      `SELECT campaign.id, campaign.name, ${METRICS} FROM campaign
       WHERE ${between(range)} AND metrics.impressions > 0
       ORDER BY metrics.cost_micros DESC LIMIT 100`,
    ),
  ]);

  const byDate = new Map(daily.map((r) => [r.segments?.date, r.metrics]));
  const dailyRows: AdsDailyRow[] = eachDay(range).map((date) => {
    const t = totalsFrom(byDate.get(date));
    return { date, spend: t.spend, impressions: t.impressions, clicks: t.clicks, conversions: t.conversions };
  });

  const totals = daily.reduce<AdsTotals>(
    (acc, r) => {
      const t = totalsFrom(r.metrics);
      acc.spend += t.spend;
      acc.impressions += t.impressions;
      acc.clicks += t.clicks;
      acc.conversions += t.conversions;
      acc.conversionValue += t.conversionValue;
      return acc;
    },
    { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0 },
  );

  const campaignRows: AdsCampaignRow[] = campaigns.map((r) => ({
    id: r.campaign?.id ?? "",
    name: r.campaign?.name ?? "(sem nome)",
    ...totalsFrom(r.metrics),
  }));

  return {
    accountId: customerId,
    currency: daily[0]?.customer?.currencyCode ?? "BRL",
    conversionLabel: "Conversões (Google Ads)",
    totals,
    previousTotals: totalsFrom(previous[0]?.metrics),
    daily: dailyRows,
    campaigns: campaignRows,
  };
}
