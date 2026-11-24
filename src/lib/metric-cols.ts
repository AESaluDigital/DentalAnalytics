import { dec, int, money, pct } from "./format";
import { ratio } from "./metrics";
import type { MetricKey } from "./metric-help";
import type { AdsMetrics } from "./types";

/** Colunas de métricas usadas nas tabelas de campanhas, grupos, palavras-chave e termos. */
export interface MetricCol {
  key: string;
  label: string;
  help: MetricKey;
  value: (m: AdsMetrics) => string;
  /** Classe extra da célula (ex.: cor do ROAS). */
  tone?: (m: AdsMetrics) => string | undefined;
}

export function roasValue(m: Pick<AdsMetrics, "conversionValue" | "spend">): number | null {
  return m.conversionValue > 0 ? ratio(m.conversionValue, m.spend) : null;
}

export function roasText(v: number | null): string {
  return v === null ? "—" : `${dec(v)}x`;
}

export function roasTone(v: number | null): "good" | "bad" | undefined {
  if (v === null) return undefined;
  return v >= 1 ? "good" : "bad";
}

export function adsCols(currency: string, totalSpend: number, hasValue: boolean): MetricCol[] {
  const cols: MetricCol[] = [
    { key: "spend", label: "Investimento", help: "spend", value: (m) => money(m.spend, currency) },
    { key: "share", label: "% invest.", help: "spendShare", value: (m) => pct(ratio(m.spend, totalSpend)) },
    { key: "impr", label: "Impressões", help: "impressions", value: (m) => int(m.impressions) },
    { key: "clicks", label: "Cliques", help: "clicks", value: (m) => int(m.clicks) },
    { key: "ctr", label: "CTR", help: "ctr", value: (m) => pct(ratio(m.clicks, m.impressions), 2) },
    { key: "cpc", label: "CPC", help: "cpc", value: (m) => money(ratio(m.spend, m.clicks), currency) },
    { key: "conv", label: "Conversões", help: "conversions", value: (m) => dec(m.conversions) },
    { key: "cvr", label: "Taxa conv.", help: "conversionRate", value: (m) => pct(ratio(m.conversions, m.clicks), 2) },
    { key: "cpa", label: "Custo/conv.", help: "cpa", value: (m) => money(ratio(m.spend, m.conversions), currency) },
  ];
  if (hasValue) {
    cols.push(
      { key: "value", label: "Valor conv.", help: "conversionValue", value: (m) => money(m.conversionValue, currency) },
      {
        key: "roas",
        label: "ROAS",
        help: "roas",
        value: (m) => roasText(roasValue(m)),
        tone: (m) => {
          const t = roasTone(roasValue(m));
          return t ? `roas-${t}` : undefined;
        },
      },
    );
  }
  return cols;
}

export const MATCH_LABEL: Record<string, string> = {
  EXACT: "Exata",
  PHRASE: "Frase",
  BROAD: "Ampla",
};
