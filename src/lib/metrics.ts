import type { AdsTotals } from "./types";

/** Divisão segura: retorna null quando o denominador é zero. */
export function ratio(a: number, b: number): number | null {
  return b > 0 ? a / b : null;
}

export function adsKpis(t: AdsTotals) {
  return {
    ctr: ratio(t.clicks, t.impressions),
    cpc: ratio(t.spend, t.clicks),
    cpm: (() => {
      const r = ratio(t.spend, t.impressions);
      return r === null ? null : r * 1000;
    })(),
    cpa: ratio(t.spend, t.conversions),
    roas: ratio(t.conversionValue, t.spend),
    conversionRate: ratio(t.conversions, t.clicks),
  };
}

/** Variação relativa entre períodos (null quando não há base de comparação). */
export function delta(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return (current - previous) / previous;
}

export function sumAds(a: AdsTotals, b: AdsTotals): AdsTotals {
  return {
    spend: a.spend + b.spend,
    impressions: a.impressions + b.impressions,
    clicks: a.clicks + b.clicks,
    conversions: a.conversions + b.conversions,
    conversionValue: a.conversionValue + b.conversionValue,
  };
}

export const EMPTY_ADS: AdsTotals = { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0 };
