"use client";

import { useMemo, useState } from "react";
import { dec, money } from "@/lib/format";
import { METRIC_HELP } from "@/lib/metric-help";
import type { AdsDailyRow } from "@/lib/types";
import InfoTip from "../InfoTip";
import { SpendConvCplChart } from "./Charts";

export interface ChannelSeries {
  key: string;
  label: string;
  daily: AdsDailyRow[];
}

const COLORS = { spend: "var(--series-1)", conversions: "var(--series-3)", cpl: "var(--series-2)" };

/** Gráfico principal com seletor: visão global (soma dos canais) ou um canal específico. */
export default function MainChart({ channels, currency }: { channels: ChannelSeries[]; currency: string }) {
  const options = channels.length > 1 ? [{ key: "all", label: "Global" }, ...channels] : channels;
  const [sel, setSel] = useState(options[0].key);

  const rows = useMemo(() => {
    const picked = sel === "all" ? channels : channels.filter((c) => c.key === sel);
    const base = picked[0]?.daily ?? [];
    return base.map((d, i) => {
      const spend = picked.reduce((a, c) => a + (c.daily[i]?.spend ?? 0), 0);
      const conversions = picked.reduce((a, c) => a + (c.daily[i]?.conversions ?? 0), 0);
      return { date: d.date, spend, conversions, cpl: conversions > 0 ? spend / conversions : null };
    });
  }, [channels, sel]);

  const totals = rows.reduce((a, r) => ({ spend: a.spend + r.spend, conv: a.conv + r.conversions }), { spend: 0, conv: 0 });

  return (
    <div className="stack main-chart" style={{ gap: 14 }}>
      <div className="row between">
        <h3 className="chart-title" style={{ margin: 0 }}>Investimento, conversões e CPL por dia</h3>
        {options.length > 1 && (
          <div className="seg" role="group" aria-label="Plataforma do gráfico">
            {options.map((o) => (
              <button key={o.key} type="button" className="btn" aria-pressed={sel === o.key} onClick={() => setSel(o.key)}>
                {o.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="chart-stats">
        <div>
          <span className="kpi-label"><i className="dot" style={{ background: COLORS.spend }} />Investimento
            <InfoTip label="Investimento" text={METRIC_HELP.spend} /></span>
          <strong>{money(totals.spend, currency)}</strong>
        </div>
        <div>
          <span className="kpi-label"><i className="dot" style={{ background: COLORS.conversions }} />Conversões
            <InfoTip label="Conversões" text={METRIC_HELP.conversions} /></span>
          <strong>{dec(totals.conv)}</strong>
        </div>
        <div>
          <span className="kpi-label"><i className="dot dash" style={{ background: COLORS.cpl }} />CPL
            <InfoTip label="CPL (custo por lead)" text={METRIC_HELP.cpl} /></span>
          <strong>{money(totals.conv > 0 ? totals.spend / totals.conv : null, currency)}</strong>
        </div>
      </div>
      <SpendConvCplChart data={rows} currency={currency} colors={COLORS} />
    </div>
  );
}
