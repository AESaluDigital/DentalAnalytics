"use client";

import { useMemo, useState } from "react";
import { eachDay } from "@/lib/dates";
import { dec, int, money, pct, signedPct } from "@/lib/format";
import { METRIC_HELP, type MetricKey } from "@/lib/metric-help";
import { delta, ratio } from "@/lib/metrics";
import type { DateRange, SellbotData, SellbotEntry, SellbotPipelineData } from "@/lib/types";
import InfoTip from "../InfoTip";
import { DailyLineChart } from "./Charts";
import UtmTree from "./UtmTree";

const COLOR = "#00A86B";
/** Ganhos e perdidos no funil: cores próprias, diferentes das etapas em aberto. */
const WON_COLOR = "var(--series-3)";
const LOST_COLOR = "var(--bad)";

/** Campanha de anúncio conhecida no relatório, para cruzar com a campanha do lead. */
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

interface Agg {
  leads: number;
  won: number;
  value: number;
}

/** Agrupa as entradas por uma chave, somando leads, vendas e faturamento. */
function groupEntries<K>(entries: SellbotEntry[], keyOf: (e: SellbotEntry) => string, extra: (e: SellbotEntry) => K) {
  const m = new Map<string, Agg & { extra: K }>();
  for (const e of entries) {
    const k = keyOf(e);
    const x = m.get(k) ?? { leads: 0, won: 0, value: 0, extra: extra(e) };
    x.leads++;
    if (e.status === "won") {
      x.won++;
      x.value += e.value;
    }
    m.set(k, x);
  }
  return [...m.entries()].map(([key, x]) => ({ key, ...x })).sort((a, b) => b.value - a.value || b.leads - a.leads);
}

const norm = (s: string) => s.trim().toLowerCase();

export default function SellbotSection({ data, range, currency, adSpend, adSpendPrev, adConversions, campaigns }: Props) {
  const global = data.pipelines.filter((p) => p.inGlobal);
  const [sel, setSel] = useState<string>("global");
  const pipeline = data.pipelines.find((p) => p.id === sel) ?? null;
  const picked: SellbotPipelineData[] = pipeline ? [pipeline] : global;

  const v = useMemo(() => {
    const entries = picked.flatMap((p) => p.entries);
    const wonList = entries.filter((e) => e.status === "won");
    const lostList = entries.filter((e) => e.status === "lost");
    const openList = entries.filter((e) => e.status === "open");
    const reasons = new Map<string, number>();
    for (const e of lostList) {
      const r = e.lostReason ?? "Sem motivo informado";
      reasons.set(r, (reasons.get(r) ?? 0) + 1);
    }
    return {
      entries,
      created: entries.length,
      won: wonList.length,
      wonValue: wonList.reduce((a, e) => a + e.value, 0),
      lost: lostList.length,
      lostValue: lostList.reduce((a, e) => a + e.value, 0),
      open: openList.length,
      openValue: openList.reduce((a, e) => a + e.value, 0),
      prev: picked.reduce(
        (a, p) => ({ created: a.created + p.prev.created, won: a.won + p.prev.won, wonValue: a.wonValue + p.prev.wonValue, lost: a.lost + p.prev.lost }),
        { created: 0, won: 0, wonValue: 0, lost: 0 },
      ),
      lostReasons: [...reasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    };
  }, [picked]);

  const ticket = ratio(v.wonValue, v.won);
  const roas = adSpend ? ratio(v.wonValue, adSpend) : null;
  const roasPrev = adSpendPrev ? ratio(v.prev.wonValue, adSpendPrev) : null;
  const leadToSale = ratio(v.won, v.created);

  const daily = useMemo(() => {
    const leads = new Map<string, number>();
    const sales = new Map<string, number>();
    for (const e of v.entries) {
      leads.set(e.date, (leads.get(e.date) ?? 0) + 1);
      if (e.status === "won") sales.set(e.date, (sales.get(e.date) ?? 0) + 1);
    }
    return eachDay(range).map((date) => ({ date, leads: leads.get(date) ?? 0, sales: sales.get(date) ?? 0 }));
  }, [v.entries, range]);

  const bySource = useMemo(() => groupEntries(v.entries, (e) => e.source, () => null), [v.entries]);

  // Cruza a campanha do lead com as campanhas de anúncio do relatório (por ID ou nome).
  const byCampaign = useMemo(() => {
    const index = new Map<string, AdCampaignRef>();
    for (const c of campaigns) {
      if (c.id) index.set(norm(c.id), c);
      index.set(norm(c.name), c);
    }
    const adOf = (e: SellbotEntry) =>
      (e.metaCampaignId && index.get(norm(e.metaCampaignId))) || (e.campaign && index.get(norm(e.campaign))) || null;
    return groupEntries(v.entries, (e) => e.campaign ?? "(sem campanha)", adOf);
  }, [v.entries, campaigns]);


  // Sem atribuição: nem UTM nem campanha (leads do Meta Lead Ads já trazem a campanha da Meta).
  const noUtm = v.entries.filter((e) => !e.utm.source && !e.utm.campaign && !e.campaign && !e.metaCampaignId).length;
  const maxStage = Math.max(1, v.won, v.lost, ...(pipeline?.stages.map((s) => s.count) ?? [1]));

  return (
    <section className="card report-section sellbot">
      <div className="row between">
        <div>
          <h2 className="section-title"><span className="swatch" style={{ background: COLOR }} aria-hidden /> Vendas — Sellbot (CRM)</h2>
          <p className="muted small" style={{ margin: "4px 0 0" }}>Leads e negócios criados no período (data de criação).</p>
        </div>
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
        <Kpi label="Leads (entrada)" help="crmLeads" value={int(v.created)} change={delta(v.created, v.prev.created)} />
        <Kpi label="Vendas" help="sales" value={int(v.won)} change={delta(v.won, v.prev.won)} />
        <Kpi label="Faturamento" help="salesRevenue" value={money(v.wonValue, currency)} change={delta(v.wonValue, v.prev.wonValue)} />
        <Kpi label="Ticket médio" help="ticket" value={money(ticket, currency)} change={delta(ticket, ratio(v.prev.wonValue, v.prev.won))} />
        <Kpi label="Lead → venda" help="leadToSale" value={pct(leadToSale, 1)}
          change={delta(leadToSale, ratio(v.prev.won, v.prev.created))} />
        <Kpi label={pipeline ? "ROAS real (este funil)" : "ROAS real"} help="realRoas"
          value={roas === null ? "—" : `${dec(roas)}x`} change={roas === null ? undefined : delta(roas, roasPrev)}
          tone={roas === null ? undefined : roas >= 1 ? "good" : "bad"}
          note={adSpend ? undefined : "sem investimento em anúncios no período"} />
        {adSpend ? (
          <>
            <Kpi label="Custo por lead (CRM)" help="crmCpl" value={money(ratio(adSpend, v.created), currency)} lowerIsBetter
              change={delta(ratio(adSpend, v.created), adSpendPrev ? ratio(adSpendPrev, v.prev.created) : null)} />
            <Kpi label="Custo por venda" help="costPerSale" value={money(ratio(adSpend, v.won), currency)} lowerIsBetter
              change={delta(ratio(adSpend, v.won), adSpendPrev ? ratio(adSpendPrev, v.prev.won) : null)} />
          </>
        ) : null}
        {adConversions ? (
          <Kpi label="Conversões → leads CRM" help="convToLead" value={pct(ratio(v.created, adConversions), 1)}
            note={`${int(v.created)} leads no CRM de ${dec(adConversions)} conversões`} />
        ) : null}
        <Kpi label="Perdidos" help="lost" value={int(v.lost)} change={delta(v.lost, v.prev.lost)} lowerIsBetter />
        <Kpi label="Ainda em aberto" help="openPipeline" value={int(v.open)} note={money(v.openValue, currency)} />
      </div>

      <div className="chart-grid">
        <div>
          <h3 className="chart-title">Entrada de leads e vendas por dia (data de criação)</h3>
          <DailyLineChart data={daily} format="int" series={[
            { key: "leads", label: "Leads", color: COLOR },
            { key: "sales", label: "Vendas", color: "var(--series-2)" },
          ]} />
        </div>
        {pipeline ? (
          <div>
            <h3 className="chart-title">Funil {pipeline.name} — leads do período por etapa, ganhos e perdidos</h3>
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
                <div className="funnel-row funnel-total funnel-won">
                  <span className="funnel-name"><i className="funnel-dot" style={{ background: WON_COLOR }} aria-hidden /> Ganhos</span>
                  <span className="funnel-bar"><span style={{ width: `${(v.won / maxStage) * 100}%`, background: WON_COLOR }} /></span>
                  <span className="funnel-num">{int(v.won)}</span>
                  <span className="funnel-val muted">{money(v.wonValue, currency)}</span>
                </div>
                <div className="funnel-row funnel-lost">
                  <span className="funnel-name"><i className="funnel-dot" style={{ background: LOST_COLOR }} aria-hidden /> Perdidos</span>
                  <span className="funnel-bar"><span style={{ width: `${(v.lost / maxStage) * 100}%`, background: LOST_COLOR }} /></span>
                  <span className="funnel-num">{int(v.lost)}</span>
                  <span className="funnel-val muted">{money(v.lostValue, currency)}</span>
                </div>
                <p className="muted small" style={{ margin: 0 }}>
                  Dos {int(v.created)} leads do período: {int(v.open)} em aberto · {int(v.won)} ganhos · {int(v.lost)} perdidos
                </p>
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
                    <th className="num">Leads</th>
                    <th className="num">Vendas</th>
                    <th className="num">Faturamento</th>
                    <th className="num">Perdidos</th>
                    <th className="num">Abertos</th>
                  </tr>
                </thead>
                <tbody>
                  {data.pipelines.map((p) => {
                    const won = p.entries.filter((e) => e.status === "won");
                    return (
                      <tr key={p.id} className={p.inGlobal ? undefined : "muted"}>
                        <td className="name">
                          <button type="button" className="link-btn" onClick={() => setSel(p.id)}>{p.name}</button>
                          {!p.inGlobal && <span className="tree-count">fora da Global</span>}
                        </td>
                        <td className="num">{int(p.entries.length)}</td>
                        <td className="num">{int(won.length)}</td>
                        <td className="num">{money(won.reduce((a, e) => a + e.value, 0), currency)}</td>
                        <td className="num">{int(p.entries.filter((e) => e.status === "lost").length)}</td>
                        <td className="num">{int(p.entries.filter((e) => e.status === "open").length)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="chart-grid">
        <div>
          <h3 className="chart-title">Leads e vendas por origem</h3>
          {bySource.length === 0 ? <p className="muted">Nenhum lead no período.</p> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Origem</th><th className="num">Leads</th><th className="num">Vendas</th><th className="num">Conv.</th><th className="num">Faturamento</th></tr></thead>
                <tbody>
                  {bySource.map((s) => (
                    <tr key={s.key}>
                      <td className="name">{s.key}</td>
                      <td className="num">{int(s.leads)}</td>
                      <td className="num">{int(s.won)}</td>
                      <td className="num">{pct(ratio(s.won, s.leads), 1)}</td>
                      <td className="num">{money(s.value, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div>
          <h3 className="chart-title">Leads e vendas por campanha</h3>
          {byCampaign.length === 0 ? <p className="muted">Nenhum lead no período.</p> : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Campanha</th><th className="num">Leads</th><th className="num">Vendas</th><th className="num">Faturamento</th>
                    <th className="num"><span className="th-help">ROAS<InfoTip label="ROAS real da campanha" text="Faturamento das vendas desta campanha ÷ investimento dela no período. Só aparece quando a campanha do lead bate com uma campanha do Meta Ads ou do Google Ads deste relatório." /></span></th></tr>
                </thead>
                <tbody>
                  {byCampaign.map((c) => {
                    const r = c.extra ? ratio(c.value, c.extra.spend) : null;
                    return (
                      <tr key={c.key}>
                        <td className="name">
                          {c.extra ? c.extra.name : c.key}
                          {c.extra && <span className="tree-count">{c.extra.platform} · investimento {money(c.extra.spend, currency)}</span>}
                        </td>
                        <td className="num">{int(c.leads)}</td>
                        <td className="num">{int(c.won)}</td>
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

      <UtmTree entries={v.entries} currency={currency} />

      {v.lostReasons.length > 0 && (
        <div>
          <h3 className="chart-title">Principais motivos de perda (leads do período)</h3>
          <div className="reason-list">
            {v.lostReasons.slice(0, 8).map((r) => (
              <span key={r.reason} className="badge">{r.reason} · {int(r.count)}</span>
            ))}
          </div>
        </div>
      )}

      {v.created > 0 && noUtm / v.created > 0.3 && (
        <p className="muted small" style={{ margin: 0 }}>
          ⓘ {int(noUtm)} de {int(v.created)} leads chegaram sem UTM nem campanha. Para atribuir melhor por campanha, envie os UTMs/gclid no
          formulário do site e nos links dos anúncios para a Sellbot.
        </p>
      )}
      {data.notes.map((n) => <p key={n} className="muted small" style={{ margin: 0 }}>ⓘ {n}</p>)}
    </section>
  );
}
