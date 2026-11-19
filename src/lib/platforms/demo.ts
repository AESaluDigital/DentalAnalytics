import "server-only";
import { eachDay } from "../dates";
import type { AdsPlatformData, AdsTotals, DateRange, Ga4Data, Ga4Totals } from "../types";

/**
 * Dados FICTÍCIOS para testar o fluxo sem credenciais (DEMO_MODE=true).
 * Determinísticos por conta + data: gerar de novo o mesmo período dá os mesmos números.
 */

function seeded(seedText: string) {
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i++) h = Math.imul(h ^ seedText.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function dayFactor(id: string, date: string) {
  const r = seeded(`${id}:${date}`)();
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  const weekend = dow === 0 || dow === 6 ? 0.8 : 1;
  return (0.75 + r * 0.5) * weekend;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function adsSeries(id: string, range: DateRange, base: { spend: number; cpm: number; ctr: number; cvr: number }) {
  return eachDay(range).map((date) => {
    const f = dayFactor(id, date);
    const spend = r2(base.spend * f);
    const impressions = Math.round((spend / base.cpm) * 1000);
    const clicks = Math.round(impressions * base.ctr * (0.9 + dayFactor(id + "c", date) * 0.2));
    const conversions = Math.round(clicks * base.cvr * (0.8 + dayFactor(id + "v", date) * 0.4));
    return { date, spend, impressions, clicks, conversions };
  });
}

function sum(rows: { spend: number; impressions: number; clicks: number; conversions: number }[]): AdsTotals {
  return rows.reduce<AdsTotals>(
    (a, r) => ({
      spend: r2(a.spend + r.spend),
      impressions: a.impressions + r.impressions,
      clicks: a.clicks + r.clicks,
      conversions: a.conversions + r.conversions,
      conversionValue: 0,
    }),
    { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0 },
  );
}

function campaigns(id: string, totals: AdsTotals, names: string[]) {
  const rand = seeded(`${id}:camp`);
  const weights = names.map(() => 0.4 + rand());
  const total = weights.reduce((a, b) => a + b, 0);
  return names
    .map((name, i) => {
      const w = weights[i] / total;
      const cvrJitter = 0.7 + rand() * 0.6;
      return {
        id: `${i + 1}`,
        name,
        spend: r2(totals.spend * w),
        impressions: Math.round(totals.impressions * w),
        clicks: Math.round(totals.clicks * w),
        conversions: Math.round(totals.conversions * w * cvrJitter),
        conversionValue: 0,
      };
    })
    .sort((a, b) => b.spend - a.spend);
}

export function demoMeta(accountId: string, conversionAction: string, range: DateRange, prev: DateRange): AdsPlatformData {
  const base = { spend: 180, cpm: 22, ctr: 0.012, cvr: 0.07 };
  const daily = adsSeries(`meta${accountId}`, range, base);
  const totals = sum(daily);
  const previousTotals = sum(adsSeries(`meta${accountId}`, prev, { ...base, spend: base.spend * 0.92 }));
  totals.reach = Math.round(totals.impressions / 2.3);
  previousTotals.reach = Math.round(previousTotals.impressions / 2.2);
  return {
    accountId,
    currency: "BRL",
    conversionLabel: conversionAction,
    totals,
    previousTotals,
    daily,
    campaigns: campaigns(`meta${accountId}`, totals, [
      "[Leads] Formulário instantâneo — Público amplo",
      "[Leads] Lookalike 1% clientes",
      "[Remarketing] Visitantes 30 dias",
      "[Mensagens] WhatsApp — Região",
    ]),
  };
}

export function demoGoogleAds(customerId: string, range: DateRange, prev: DateRange): AdsPlatformData {
  const base = { spend: 140, cpm: 65, ctr: 0.045, cvr: 0.09 };
  const daily = adsSeries(`gads${customerId}`, range, base);
  return {
    accountId: customerId,
    currency: "BRL",
    conversionLabel: "Conversões (Google Ads)",
    totals: sum(daily),
    previousTotals: sum(adsSeries(`gads${customerId}`, prev, { ...base, spend: base.spend * 1.05 })),
    daily,
    campaigns: campaigns(`gads${customerId}`, sum(daily), [
      "Pesquisa — Marca",
      "Pesquisa — Serviços principais",
      "Performance Max — Conversões",
      "Display — Remarketing",
    ]),
  };
}

export function demoGa4(propertyId: string, range: DateRange, prev: DateRange): Ga4Data {
  const id = `ga4${propertyId}`;
  const series = (r: DateRange, scale: number) =>
    eachDay(r).map((date) => {
      const sessions = Math.round(420 * scale * dayFactor(id, date));
      return { date, sessions, totalUsers: Math.round(sessions * 0.78), keyEvents: Math.round(sessions * 0.024) };
    });
  const totals = (rows: ReturnType<typeof series>): Ga4Totals => {
    const sessions = rows.reduce((a, r) => a + r.sessions, 0);
    const totalUsers = rows.reduce((a, r) => a + r.totalUsers, 0);
    return {
      sessions,
      totalUsers,
      newUsers: Math.round(totalUsers * 0.71),
      engagedSessions: Math.round(sessions * 0.58),
      keyEvents: rows.reduce((a, r) => a + r.keyEvents, 0),
      totalRevenue: 0,
    };
  };
  const daily = series(range, 1);
  const t = totals(daily);
  const shares: [string, number, number][] = [
    ["Paid Social", 0.34, 0.52],
    ["Paid Search", 0.24, 0.64],
    ["Organic Search", 0.21, 0.61],
    ["Direct", 0.13, 0.55],
    ["Referral", 0.05, 0.6],
    ["Organic Social", 0.03, 0.48],
  ];
  return {
    propertyId,
    totals: t,
    previousTotals: totals(series(prev, 0.94)),
    daily,
    channels: shares.map(([channel, share, engagementRate]) => ({
      channel,
      sessions: Math.round(t.sessions * share),
      totalUsers: Math.round(t.totalUsers * share),
      keyEvents: Math.round(t.keyEvents * share),
      engagementRate,
    })),
  };
}
