import "server-only";
import { eachDay } from "../dates";
import type { DateRange, Ga4ChannelRow, Ga4Data, Ga4DailyRow, Ga4Totals } from "../types";
import { googleAccessToken } from "./google-oauth";
import { fetchJson, num } from "./http";

/**
 * Google Analytics Data API v1beta — properties.batchRunReports
 * Docs: https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/batchRunReports
 * Métricas/dimensões: https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema
 */

interface Ga4Row {
  dimensionValues?: { value: string }[];
  metricValues?: { value: string }[];
}

interface Ga4Report {
  rows?: Ga4Row[];
}

interface BatchResponse {
  reports?: Ga4Report[];
}

const PLATFORM = "Google Analytics 4";
const TOTAL_METRICS = ["sessions", "totalUsers", "newUsers", "engagedSessions", "keyEvents", "totalRevenue"] as const;

function totalsFrom(row: Ga4Row | undefined): Ga4Totals {
  const v = row?.metricValues ?? [];
  return {
    sessions: num(v[0]?.value),
    totalUsers: num(v[1]?.value),
    newUsers: num(v[2]?.value),
    engagedSessions: num(v[3]?.value),
    keyEvents: num(v[4]?.value),
    totalRevenue: num(v[5]?.value),
  };
}

export async function fetchGa4(propertyId: string, range: DateRange, prev: DateRange): Promise<Ga4Data> {
  const token = await googleAccessToken(PLATFORM);
  const current = { startDate: range.start, endDate: range.end };

  const body = {
    requests: [
      // 0: totais do período atual e anterior (sem dimensões → uma linha por período)
      {
        dateRanges: [
          { ...current, name: "current" },
          { startDate: prev.start, endDate: prev.end, name: "previous" },
        ],
        metrics: TOTAL_METRICS.map((name) => ({ name })),
      },
      // 1: série diária
      {
        dateRanges: [current],
        dimensions: [{ name: "date" }],
        metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "keyEvents" }],
        orderBys: [{ dimension: { dimensionName: "date" } }],
        limit: "400",
      },
      // 2: por canal
      {
        dateRanges: [current],
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "keyEvents" }, { name: "engagementRate" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: "20",
      },
    ],
  };

  const res = await fetchJson<BatchResponse>(
    PLATFORM,
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:batchRunReports`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  const [totalsReport, dailyReport, channelReport] = res.reports ?? [];

  // Com 2 dateRanges, a API acrescenta a dimensão "dateRange" com o nome informado.
  const totalsRows = totalsReport?.rows ?? [];
  const findRange = (name: string) => totalsRows.find((r) => r.dimensionValues?.some((d) => d.value === name));

  const byDate = new Map(
    (dailyReport?.rows ?? []).map((r) => {
      const raw = r.dimensionValues?.[0]?.value ?? ""; // YYYYMMDD
      return [`${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`, r.metricValues ?? []];
    }),
  );
  const daily: Ga4DailyRow[] = eachDay(range).map((date) => {
    const v = byDate.get(date) ?? [];
    return { date, sessions: num(v[0]?.value), totalUsers: num(v[1]?.value), keyEvents: num(v[2]?.value) };
  });

  const channels: Ga4ChannelRow[] = (channelReport?.rows ?? []).map((r) => {
    const v = r.metricValues ?? [];
    return {
      channel: r.dimensionValues?.[0]?.value ?? "(não definido)",
      sessions: num(v[0]?.value),
      totalUsers: num(v[1]?.value),
      keyEvents: num(v[2]?.value),
      engagementRate: num(v[3]?.value),
    };
  });

  return {
    propertyId,
    totals: totalsFrom(findRange("current")),
    previousTotals: totalsFrom(findRange("previous")),
    daily,
    channels,
  };
}
