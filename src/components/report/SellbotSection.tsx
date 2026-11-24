"use client";

import { useMemo, useState } from "react";
import { eachDay } from "@/lib/dates";
import { dec, int, money, pct, signedPct } from "@/lib/format";
import { METRIC_HELP, type MetricKey } from "@/lib/metric-help";
import { delta, ratio } from "@/lib/metrics";
import type { DateRange, SellbotData, SellbotPipelineData } from "@/lib/types";
import InfoTip from "../InfoTip";
import { DailyBarChart } from "./Charts";

const COLOR = "#00A86B";

/** Campanha de anúncio conhecida no relatório, para cruzar com a campanha da venda. */
export interface AdCampaignRef {
  id: string;
  name: string;
  platform: "Meta Ads" | "Google Ads";
  spend: number;
}

interface Props {
  data: SellbotData;
  range: DateRange;
  currency: string;
  /** Investimento em anúncios (Meta + Google) no período e no anterior; null sem mídia paga. */
  adSpend: number | null;
  adSpendPrev: number | null;
  /** Conversões reportadas pelas plataformas no período. */
  adConversions: number | null;
  campaigns: AdCampaignRef[];
}

function Kpi({ label, help, value, change, lowerIsBetter, note, tone }: {
  label: string;
  help: MetricKey;
  value: string;
  change?: number | null;
  lowerIsBetter?: boolean;
  note?: string;
  tone?: "good" | "bad";
}) {
  const good = change === undefined || change === null || change === 0 ? null : (change > 0) !== !!lowerIsBetter;
  return (
    <div className={`kpi${tone ? ` kpi-tone-${tone}` : ""}`}>
      <span className="kpi-label">{label}<InfoTip label={label} text={METRIC_HELP[help]} /></span>
      <span className="kpi-value">{value}</span>
      {change !== undefined && (
        <span className={`kpi-delta ${good === null ? "" : good ? "up-good" : "down-bad"}`}>
          {change === null ? <span className="muted">sem comparação</span> : (
            <><span aria-hidden>{change > 0 ? "▲" : change < 0 ? "▼" : "■"}</span> {signedPct(change)}<span className="muted"> vs. anterior</span></>
          )}
        </span>
      )}
      {note && <span className="kpi-delta"><span className="muted">{note}</span></span>}
    </div>
  );
}

/** Soma vários funis numa visão só. */
function combine(list: SellbotPipelineData[]) {
  return {
    won: list.reduce((a, p) => ({ count: a.count + p.won.count, value: a.value + p.won.value }), { count: 0, value: 0 }),
    wonPrev: list.reduce((a, p) => ({ count: a.count + p.wonPrev.count, value: a.value + p.wonPrev.value }), { count: 0, value: 0 }),
    lost: list.reduce((a, p) => a + p.lost.count, 0),
    lostPrev: list.reduce((a, p) => a + p.lostPrev.count, 0),
    open: list.reduce((a, p) => ({ count: a.count + p.open.count, value: a.value + p.open.value }), { count: 0, value: 0 }),
    sales: list.flatMap((p) => p.sales),
    lostReasons: [...list.flatMap((p) => p.lostReasons).reduce((m, r) => m.set(r.reason, (m.get(r.reason) ?? 0) + r.count), new Map<string, number>())]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
  };
}

const norm = (s: string) => s.trim().toLowerCase();

export default function SellbotSection({ data, range, currency, adSpend, adSpendPrev, adConversions, campaigns }: Props) {
  const global = data.pipelines.filter((p) => p.inGlobal);
  const [sel, setSel] = useState<string>("global");
  const pipeline = data.pipelines.find((p) => p.id === sel) ?? null;
  const v = useMemo(() => combine(pipeline ? [pipeline] : global), [pipeline, global]);

  const ticket = ratio(v.won.value, v.won.count);
  const roas = adSpend ? ratio(v.won.value, adSpend) : null;
  const roasPrev = adSpendPrev ? ratio(v.wonPrev.value, adSpendPrev) : null;
  const winRate = ratio(v.won.count, v.won.count + v.lost);
  const winRatePrev = ratio(v.wonPrev.count, v.wonPrev.count + v.lostPrev);

  const daily = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of v.sales) m.set(s.date, (m.get(s.date) ?? 0) + s.value);
    return eachDay(range).map((date) => ({ date, revenue: m.get(date) ?? 0 }));
  }, [v.sales, range]);

  const bySource = useMemo(() => {
    const m = new Map<string, { count: number; value: number }>();
    for (const s of v.sales) {
      const x = m.get(s.source) ?? { count: 0, value: 0 };
      m.set(s.source, { count: x.count + 1, value: x.value + s.value });
    }
    return [...m.entries()].map(([source, x]) => ({ source, ...x })).sort((a, b) => b.value - a.value);
  }, [v.sales]);

  // Cruza a campanha da venda com as campanhas de anúncio do relatório (por ID ou nome).
  const byCampaign = useMemo(() => {
    const index = new Map<string, AdCampaignRef>();
    for (const c of campaigns) {
      if (c.id) index.set(norm(c.id), c);
      index.set(norm(c.name), c);
    }
    const m = new Map<string, { count: number; value: number; ad: AdCampaignRef | null }>();
    for (const s of v.sales) {
      const label = s.campaign ?? "(sem campanha)";
      const ad = (s.metaCampaignId && index.get(norm(s.metaCampaignId))) || (s.campaign && index.get(norm(s.campaign))) || null;
      const x = m.get(label) ?? { count: 0, value: 0, ad };
      m.set(label, { count: x.count + 1, value: x.value + s.value, ad: x.ad ?? ad });
    }
    return [...m.entries()].map(([campaign, x]) => ({ campaign, ...x })).sort((a, b) => b.value - a.value);
  }, [v.sales, campaigns]);

  const unattributed = v.sales.filter((s) => s.source === "Não identificada" || s.source === "Formulário do site").length;
  const maxStage = Math.max(1, ...(pipeline?.stages.map((s) => s.count) ?? [1]));

  return (
    <section className="card report-section sellbot">
      <div className="row between">
        <h2 className="section-title"><span className="swatch" style={{ background: COLOR }} aria-hidden /> Vendas — Sellbot (CRM)</h2>
        <div className="seg" role="group" aria-label="Funil">
          <button type="button" className="btn" aria-pressed={sel === "global"} onClick={() => setSel("global")}>
            Global{global.length !== data.pipelines.length ? ` (${global.length} funis)` : ""}
          </button>
          {data.pipelines.map((p) => (
            <button key={p.id} type="button" className="btn" aria-pressed={sel === p.id} onClick={() => setSel(p.id)}>
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <div className="kpi-grid">
        <Kpi label="Vendas" help="sales" value={int(v.won.count)} change={delta(v.won.count, v.wonPrev.count)} />
        <Kpi label="Faturamento" help="salesRevenue" value={money(v.won.value, currency)} change={delta(v.won.value, v.wonPrev.value)} />
        <Kpi label="Ticket médio" help="ticket" value={money(ticket, currency)}
          change={delta(ticket, ratio(v.wonPrev.value, v.wonPrev.count))} />
        <Kpi label={pipeline ? "ROAS real (este funil)" : "ROAS real"} help="realRoas"
          value={roas === null ? "—" : `${dec(roas)}x`} change={roas === null ? undefined : delta(roas, roasPrev)}
          tone={roas === null ? undefined : roas >= 1 ? "good" : "bad"}
          note={adSpend ? undefined : "sem investimento em anúncios no período"} />
        {adSpend ? (
          <Kpi label="Custo por venda" help="costPerSale" value={money(ratio(adSpend, v.won.count), currency)} lowerIsBetter
            change={delta(ratio(adSpend, v.won.count), adSpendPrev ? ratio(adSpendPrev, v.wonPrev.count) : null)} />
        ) : null}
        {adConversions ? (
          <Kpi label="Conversões → vendas" help="convToSale" value={pct(ratio(v.won.count, adConversions), 1)}
            note={`${int(v.won.count)} vendas de ${dec(adConversions)} conversões`} />
        ) : null}
        <Kpi label="Taxa de ganho" help="winRate" value={pct(winRate)} change={delta(winRate, winRatePrev)} />
        <Kpi label="Perdidos" help="lost" value={int(v.lost)} change={delta(v.lost, v.lostPrev)} lowerIsBetter />
        <Kpi label="Em aberto agora" help="openPipeline" value={int(v.open.count)} note={money(v.open.value, currency)} />
      </div>

      <div className="chart-grid">
        <div>
          <h3 className="chart-title">Faturamento por dia (data do ganho)</h3>
          <DailyBarChart data={daily} dataKey="revenue" label="Faturamento" color={COLOR} format="money" currency={currency} />
        </div>
        {pipeline ? (
          <div>
            <h3 className="chart-title">Funil {pipeline.name} — negócios abertos por etapa</h3>
            {pipeline.stages.length === 0 ? <p className="muted">Etapas indisponíveis.</p> : (
              <div className="funnel">
                {pipeline.stages.map((s) => (
                  <div key={s.id} className="funnel-row">
                    <span className="funnel-name">{s.name}</span>
                    <span className="funnel-bar"><span style={{ width: `${(s.count / maxStage) * 100}%`, background: COLOR }} /></span>
                    <span className="funnel-num">{int(s.count)}</span>
                    <span className="funnel-val muted">{money(s.value, currency)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div>
            <h3 className="chart-title">Por funil</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Funil</th>
                    <th className="num">Vendas</th>
                    <th className="num">Faturamento</th>
                    <th className="num">Perdidos</th>
                    <th className="num">Abertos</th>
                  </tr>
                </thead>
                <tbody>
                  {data.pipelines.map((p) => (
                    <tr key={p.id} className={p.inGlobal ? undefined : "muted"}>
                      <td className="name">
                        <button type="button" className="link-btn" onClick={() => setSel(p.id)}>{p.name}</button>
                        {!p.inGlobal && <span className="tree-count">fora da Global</span>}
                      </td>
                      <td className="num">{int(p.won.count)}</td>
                      <td className="num">{money(p.won.value, currency)}</td>
                      <td className="num">{int(p.lost.count)}</td>
                      <td className="num">{int(p.open.count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="chart-grid">
        <div>
          <h3 className="chart-title">Vendas por origem</h3>
          {bySource.length === 0 ? <p className="muted">Nenhuma venda no período.</p> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Origem</th><th className="num">Vendas</th><th className="num">Faturamento</th><th className="num">%</th></tr></thead>
                <tbody>
                  {bySource.map((s) => (
                    <tr key={s.source}>
                      <td className="name">{s.source}</td>
                      <td className="num">{int(s.count)}</td>
                      <td className="num">{money(s.value, currency)}</td>
                      <td className="num">{pct(ratio(s.value, v.won.value))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div>
          <h3 className="chart-title">Vendas por campanha</h3>
          {byCampaign.length === 0 ? <p className="muted">Nenhuma venda no período.</p> : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Campanha</th><th className="num">Vendas</th><th className="num">Faturamento</th>
                    <th className="num"><span className="th-help">ROAS<InfoTip label="ROAS real da campanha" text="Faturamento das vendas desta campanha ÷ investimento dela no período. Só aparece quando a campanha da venda bate com uma campanha do Meta Ads ou do Google Ads deste relatório." /></span></th></tr>
                </thead>
                <tbody>
                  {byCampaign.map((c) => {
                    const r = c.ad ? ratio(c.value, c.ad.spend) : null;
                    return (
                      <tr key={c.campaign}>
                        <td className="name">
                          {c.ad ? c.ad.name : c.campaign}
                          {c.ad && <span className="tree-count">{c.ad.platform} · investimento {money(c.ad.spend, currency)}</span>}
                        </td>
                        <td className="num">{int(c.count)}</td>
                        <td className="num">{money(c.value, currency)}</td>
                        <td className={`num${r === null ? "" : r >= 1 ? " roas-good" : " roas-bad"}`}>{r === null ? "—" : `${dec(r)}x`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {v.lostReasons.length > 0 && (
        <div>
          <h3 className="chart-title">Principais motivos de perda</h3>
          <div className="reason-list">
            {v.lostReasons.slice(0, 8).map((r) => (
              <span key={r.reason} className="badge">{r.reason} · {int(r.count)}</span>
            ))}
          </div>
        </div>
      )}

      {v.won.count > 0 && unattributed / v.won.count > 0.3 && (
        <p className="muted small" style={{ margin: 0 }}>
          ⓘ {int(unattributed)} de {int(v.won.count)} vendas não têm a origem do anúncio (UTM). Para melhorar o ROAS por
          campanha, envie os UTMs/gclid no formulário do site para a Sellbot.
        </p>
      )}
      {data.notes.map((n) => <p key={n} className="muted small" style={{ margin: 0 }}>ⓘ {n}</p>)}
    </section>
  );
}
