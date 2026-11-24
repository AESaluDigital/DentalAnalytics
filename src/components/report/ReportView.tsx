import { formatDateBr } from "@/lib/dates";
import { dec, int, money, pct, signedPct } from "@/lib/format";
import { EMPTY_ADS, adsKpis, delta, ratio, sumAds } from "@/lib/metrics";
import { roasText, roasTone, roasValue } from "@/lib/metric-cols";
import { METRIC_HELP, type MetricKey } from "@/lib/metric-help";
import type { AdsPlatformData, ConversionTypeRow, Ga4Data, PlatformResult, ReportAnalysis, ReportData } from "@/lib/types";
import { CategoryBarChart, DailyBarChart, DailyLineChart } from "./Charts";
import GoogleAdsDrilldown from "./GoogleAdsDrilldown";
import MetaAdsDrilldown from "./MetaAdsDrilldown";
import MainChart from "./MainChart";
import SellbotSection, { type AdCampaignRef } from "./SellbotSection";
import InfoTip from "../InfoTip";
import Logo from "../Logo";

const COLORS = { meta: "var(--series-1)", googleAds: "var(--series-2)", ga4: "var(--series-3)" };

/* ---------- peças ---------- */

interface Kpi {
  label: string;
  value: string;
  change: number | null;
  /** true quando queda é boa (custos: CPC, CPM, CPA) */
  lowerIsBetter?: boolean;
  help: MetricKey;
}

/** Cabeçalho de tabela com o "i" de explicação. */
function HelpTh({ label, help }: { label: string; help: MetricKey }) {
  return (
    <th className="num">
      <span className="th-help">{label}<InfoTip label={label} text={METRIC_HELP[help]} /></span>
    </th>
  );
}

function Delta({ change, lowerIsBetter, prevText }: { change: number | null; lowerIsBetter?: boolean; prevText?: string }) {
  const good = change === null || change === 0 ? null : (change > 0) !== !!lowerIsBetter;
  return (
    <span className={`kpi-delta ${good === null ? "" : good ? "up-good" : "down-bad"}`}>
      {change === null ? (
        <span className="muted">sem comparação</span>
      ) : (
        <>
          <span aria-hidden>{change > 0 ? "▲" : change < 0 ? "▼" : "■"}</span> {signedPct(change)}
          <span className="muted"> vs. anterior{prevText ? ` (${prevText})` : ""}</span>
        </>
      )}
    </span>
  );
}

function KpiGrid({ items, roas }: { items: Kpi[]; roas?: React.ReactNode }) {
  const grid = (
    <div className="kpi-grid">
      {items.map((k, i) => (
        <div key={k.label} className="kpi" style={{ "--i": i + (roas ? 1 : 0) } as React.CSSProperties}>
          <span className="kpi-label">{k.label}<InfoTip label={k.label} text={METRIC_HELP[k.help]} /></span>
          <span className="kpi-value">{k.value}</span>
          <Delta change={k.change} lowerIsBetter={k.lowerIsBetter} />
        </div>
      ))}
    </div>
  );
  // ROAS fica numa coluna própria à esquerda; os demais indicadores formam uma grade alinhada à direita.
  if (!roas) return grid;
  // Colunas conforme a quantidade, para as linhas ficarem completas ao lado do ROAS.
  const n = items.length;
  const cols = n <= 5 ? Math.max(n, 3) : n === 6 ? 3 : n % 5 === 0 ? 5 : 4;
  return (
    <div className="kpi-layout" style={{ "--cols": cols } as React.CSSProperties}>
      {roas}
      {grid}
    </div>
  );
}

/** ROAS explicado: valor, frase "R$ X por R$ 1", régua com o ponto de equilíbrio (1x) e variação. */
function RoasCard({ value, prev, currency }: { value: number | null; prev: number | null; currency: string }) {
  const tone = roasTone(value);
  const fill = value === null ? 0 : Math.min(value / 5, 1) * 100;
  return (
    <div className={`kpi kpi-roas${tone ? ` ${tone}` : ""}`} style={{ "--i": 0 } as React.CSSProperties}>
      <span className="kpi-label">ROAS · retorno sobre o investimento<InfoTip label="ROAS" text={METRIC_HELP.roas} /></span>
      {value === null ? (
        <>
          <span className="kpi-value">—</span>
          <span className="roas-text">
            As conversões não têm valor em dinheiro configurado. Para ver o ROAS, cadastre o valor das conversões
            (ex.: ticket médio) na plataforma.
          </span>
        </>
      ) : (
        <>
          <span className="kpi-value">{roasText(value)}</span>
          <span className="roas-text">
            <strong>{money(value, currency)}</strong> de retorno para cada {money(1, currency)} investido —{" "}
            {tone === "good" ? "o retorno cobriu o investimento." : "o retorno ainda não cobriu o investimento."}
          </span>
          <div className="roas-meter" role="img"
            aria-label={`ROAS ${roasText(value)} numa régua de 0 a 5x; 1x é o ponto de equilíbrio`}>
            <span className="roas-fill" style={{ width: `${fill}%` }} />
            <span className="roas-mark" style={{ left: "20%" }} />
          </div>
          <span className="roas-scale" aria-hidden>
            <span>0x</span><span className="be">1x · equilíbrio</span><span>5x+</span>
          </span>
          <Delta change={delta(value, prev)} prevText={roasText(prev)} />
        </>
      )}
    </div>
  );
}

function Unavailable({ result, name }: { result: PlatformResult<unknown>; name: string }) {
  if (result.status === "error") {
    return (
      <section className="card report-section">
        <h2>{name}</h2>
        <p className="error" role="status">⚠ Não foi possível obter os dados: {result.message}</p>
      </section>
    );
  }
  return null;
}

function ChannelText({ analysis, canal }: { analysis: ReportAnalysis | null; canal: "meta" | "google_ads" | "ga4" }) {
  const text = analysis?.por_canal.find((c) => c.canal === canal)?.analise;
  if (!text) return null;
  return <p className="channel-note">{text}</p>;
}

/* ---------- seções ---------- */

/** De onde vieram as conversões: WhatsApp, formulário, pixel do site, ações do Google… */
function ConversionTypes({ rows, total, currency }: { rows: ConversionTypeRow[]; total: number; currency: string }) {
  if (!rows.length) return null;
  const withSpend = rows.some((r) => (r.spend ?? 0) > 0);
  const withValue = rows.some((r) => r.conversionValue > 0);
  return (
    <div>
      <h3 className="chart-title">
        <span className="th-help">Conversões por tipo<InfoTip label="Conversões por tipo" text={METRIC_HELP.conversionTypes} /></span>
      </h3>
      <div className="conv-types">
        {rows.map((r) => (
          <div key={r.label} className="conv-type">
            <span className="conv-type-label">{r.label}</span>
            <strong className="conv-type-value">{dec(r.conversions)}</strong>
            <span className="muted small">
              {pct(ratio(r.conversions, total))} do total
              {withSpend && (r.spend ?? 0) > 0 ? ` · ${money(ratio(r.spend ?? 0, r.conversions), currency)} cada` : ""}
              {withValue && r.conversionValue > 0 ? ` · valor ${money(r.conversionValue, currency)}` : ""}
            </span>
            <span className="conv-type-bar"><span style={{ width: `${Math.min((ratio(r.conversions, total) ?? 0) * 100, 100)}%` }} /></span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdsSection({
  title,
  p,
  color,
  canal,
  analysis,
  showReach,
}: {
  title: string;
  p: AdsPlatformData;
  color: string;
  canal: "meta" | "google_ads";
  analysis: ReportAnalysis | null;
  showReach: boolean;
}) {
  const k = adsKpis(p.totals);
  const kp = adsKpis(p.previousTotals);
  const cur = p.currency;
  const hasValue = p.totals.conversionValue > 0 || p.previousTotals.conversionValue > 0;

  const items: Kpi[] = [
    { label: "Investimento", help: "spend", value: money(p.totals.spend, cur), change: delta(p.totals.spend, p.previousTotals.spend) },
    { label: "Impressões", help: "impressions", value: int(p.totals.impressions), change: delta(p.totals.impressions, p.previousTotals.impressions) },
    ...(showReach
      ? [{ label: "Alcance", help: "reach" as const, value: int(p.totals.reach ?? 0), change: delta(p.totals.reach ?? 0, p.previousTotals.reach ?? 0) }]
      : []),
    {
      label: canal === "meta" ? "Cliques no link" : "Cliques",
      help: canal === "meta" ? "linkClicks" : "clicks",
      value: int(p.totals.clicks),
      change: delta(p.totals.clicks, p.previousTotals.clicks),
    },
    { label: "CTR", help: "ctr", value: pct(k.ctr, 2), change: delta(k.ctr, kp.ctr) },
    { label: "CPC", help: "cpc", value: money(k.cpc, cur), change: delta(k.cpc, kp.cpc), lowerIsBetter: true },
    { label: "CPM", help: "cpm", value: money(k.cpm, cur), change: delta(k.cpm, kp.cpm), lowerIsBetter: true },
    { label: "Conversões", help: "conversions", value: dec(p.totals.conversions), change: delta(p.totals.conversions, p.previousTotals.conversions) },
    { label: "Taxa de conversão", help: "conversionRate", value: pct(k.conversionRate, 2), change: delta(k.conversionRate, kp.conversionRate) },
    { label: "Custo por conversão", help: "cpa", value: money(k.cpa, cur), change: delta(k.cpa, kp.cpa), lowerIsBetter: true },
    ...(hasValue
      ? [{ label: "Valor de conversão", help: "conversionValue" as const, value: money(p.totals.conversionValue, cur), change: delta(p.totals.conversionValue, p.previousTotals.conversionValue) }]
      : []),
  ];

  return (
    <section className="card report-section">
      <div className="row between">
        <h2 className="section-title"><span className="swatch" style={{ background: color }} aria-hidden /> {title}</h2>
        <span className="muted small">Conversão: {p.conversionLabel}</span>
      </div>
      <ChannelText analysis={analysis} canal={canal} />
      <KpiGrid items={items} roas={<RoasCard value={roasValue(p.totals)} prev={roasValue(p.previousTotals)} currency={cur} />} />
      {p.conversionTypes && (
        <ConversionTypes rows={p.conversionTypes} total={p.conversionTypes.reduce((t, r) => t + r.conversions, 0)} currency={cur} />
      )}

      <div className="chart-grid">
        <div>
          <h3 className="chart-title">Investimento diário</h3>
          <DailyLineChart
            data={p.daily}
            series={[{ key: "spend", label: "Investimento", color }]}
            format="money"
            currency={cur}
          />
        </div>
        <div>
          <h3 className="chart-title">Conversões por dia</h3>
          <DailyBarChart data={p.daily} dataKey="conversions" label="Conversões" color={color} />
        </div>
      </div>

      <h3 className="chart-title">{canal === "google_ads" ? "Campanhas, grupos, palavras-chave e termos" : "Campanhas, conjuntos e anúncios"}</h3>
      {canal === "google_ads" ? (
        <GoogleAdsDrilldown campaigns={p.campaigns} breakdown={p.breakdown} currency={cur}
          totalSpend={p.totals.spend} hasValue={hasValue} />
      ) : (
        <MetaAdsDrilldown campaigns={p.campaigns} breakdown={p.metaBreakdown} currency={cur}
          totalSpend={p.totals.spend} hasValue={hasValue} />
      )}
    </section>
  );
}

function Ga4Section({ g, analysis }: { g: Ga4Data; analysis: ReportAnalysis | null }) {
  const t = g.totals;
  const pt = g.previousTotals;
  const er = ratio(t.engagedSessions, t.sessions);
  const erPrev = ratio(pt.engagedSessions, pt.sessions);
  const hasRevenue = t.totalRevenue > 0 || pt.totalRevenue > 0;

  const items: Kpi[] = [
    { label: "Sessões", help: "sessions", value: int(t.sessions), change: delta(t.sessions, pt.sessions) },
    { label: "Usuários", help: "users", value: int(t.totalUsers), change: delta(t.totalUsers, pt.totalUsers) },
    { label: "Novos usuários", help: "newUsers", value: int(t.newUsers), change: delta(t.newUsers, pt.newUsers) },
    { label: "Taxa de engajamento", help: "engagementRate", value: pct(er), change: delta(er, erPrev) },
    { label: "Eventos-chave", help: "keyEvents", value: int(t.keyEvents), change: delta(t.keyEvents, pt.keyEvents) },
    {
      label: "Taxa de eventos-chave",
      help: "keyEventRate",
      value: pct(ratio(t.keyEvents, t.sessions), 2),
      change: delta(ratio(t.keyEvents, t.sessions), ratio(pt.keyEvents, pt.sessions)),
    },
    ...(hasRevenue ? [{ label: "Receita", help: "revenue" as const, value: money(t.totalRevenue), change: delta(t.totalRevenue, pt.totalRevenue) }] : []),
  ];

  return (
    <section className="card report-section">
      <h2 className="section-title"><span className="swatch" style={{ background: COLORS.ga4 }} aria-hidden /> Google Analytics 4 — site</h2>
      <ChannelText analysis={analysis} canal="ga4" />
      <KpiGrid items={items} />

      <div className="chart-grid">
        <div>
          <h3 className="chart-title">Sessões por dia</h3>
          <DailyLineChart data={g.daily} series={[{ key: "sessions", label: "Sessões", color: COLORS.ga4 }]} format="int" />
        </div>
        <div>
          <h3 className="chart-title">Sessões por canal</h3>
          <CategoryBarChart
            data={g.channels.slice(0, 8)}
            dataKey="sessions"
            categoryKey="channel"
            label="Sessões"
            color={COLORS.ga4}
          />
        </div>
      </div>

      <h3 className="chart-title">Canais de aquisição</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Canal</th>
              <HelpTh label="Sessões" help="sessions" />
              <HelpTh label="% sessões" help="sessionShare" />
              <HelpTh label="Usuários" help="users" />
              <HelpTh label="Engajamento" help="engagementRate" />
              <HelpTh label="Eventos-chave" help="keyEvents" />
            </tr>
          </thead>
          <tbody>
            {g.channels.map((c) => (
              <tr key={c.channel}>
                <td className="name">{c.channel}</td>
                <td className="num">{int(c.sessions)}</td>
                <td className="num">{pct(ratio(c.sessions, t.sessions))}</td>
                <td className="num">{int(c.totalUsers)}</td>
                <td className="num">{pct(c.engagementRate)}</td>
                <td className="num">{int(c.keyEvents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Overview({ data }: { data: ReportData }) {
  const paid = [
    data.meta.status === "ok" ? { key: "meta", label: "Meta Ads", p: data.meta.data, color: COLORS.meta } : null,
    data.googleAds.status === "ok" ? { key: "googleAds", label: "Google Ads", p: data.googleAds.data, color: COLORS.googleAds } : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null);

  if (paid.length === 0) return null;
  const currencies = new Set(paid.map((x) => x.p.currency));
  const sameCurrency = currencies.size === 1;
  const currency = paid[0].p.currency;

  const total = paid.reduce((acc, x) => sumAds(acc, x.p.totals), EMPTY_ADS);
  const totalPrev = paid.reduce((acc, x) => sumAds(acc, x.p.previousTotals), EMPTY_ADS);
  const k = adsKpis(total);
  const kp = adsKpis(totalPrev);
  const showRoas = sameCurrency && (total.conversionValue > 0 || totalPrev.conversionValue > 0);

  const items: Kpi[] = [
    ...(sameCurrency
      ? [{ label: "Investimento total", help: "spendTotal" as const, value: money(total.spend, currency), change: delta(total.spend, totalPrev.spend) }]
      : []),
    { label: "Cliques", help: "clicks", value: int(total.clicks), change: delta(total.clicks, totalPrev.clicks) },
    { label: "Conversões", help: "conversions", value: dec(total.conversions), change: delta(total.conversions, totalPrev.conversions) },
    ...(sameCurrency
      ? [{ label: "Custo por conversão", help: "cpa" as const, value: money(k.cpa, currency), change: delta(k.cpa, kp.cpa), lowerIsBetter: true }]
      : []),
    ...(data.ga4.status === "ok"
      ? [{
          label: "Sessões no site",
          help: "sessions" as const,
          value: int(data.ga4.data.totals.sessions),
          change: delta(data.ga4.data.totals.sessions, data.ga4.data.previousTotals.sessions),
        }]
      : []),
  ];

  return (
    <section className="card report-section">
      <h2>Visão geral — mídia paga</h2>
      <KpiGrid items={items}
        roas={showRoas ? <RoasCard value={roasValue(total)} prev={roasValue(totalPrev)} currency={currency} /> : undefined} />

      <div className="stack">
        {sameCurrency ? (
          <MainChart currency={currency} channels={paid.map((x) => ({ key: x.key, label: x.label, daily: x.p.daily }))} />
        ) : (
          <p className="muted small">Os canais usam moedas diferentes; o gráfico combinado não é exibido.</p>
        )}
        <div>
          <h3 className="chart-title">Comparativo por canal</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Canal</th>
                  <HelpTh label="Investimento" help="spend" />
                  <HelpTh label="% invest." help="spendShare" />
                  <HelpTh label="Conversões" help="conversions" />
                  <HelpTh label="Custo/conv." help="cpa" />
                  <HelpTh label="CTR" help="ctr" />
                  <HelpTh label="ROAS" help="roas" />
                </tr>
              </thead>
              <tbody>
                {paid.map((x) => {
                  const kk = adsKpis(x.p.totals);
                  const r = roasValue(x.p.totals);
                  const tone = roasTone(r);
                  return (
                    <tr key={x.key}>
                      <td><span className="swatch" style={{ background: x.color }} aria-hidden /> {x.label}</td>
                      <td className="num">{money(x.p.totals.spend, x.p.currency)}</td>
                      <td className="num">{sameCurrency ? pct(ratio(x.p.totals.spend, total.spend)) : "—"}</td>
                      <td className="num">{dec(x.p.totals.conversions)}</td>
                      <td className="num">{money(kk.cpa, x.p.currency)}</td>
                      <td className="num">{pct(kk.ctr, 2)}</td>
                      <td className={`num${tone ? ` roas-${tone}` : ""}`}>{roasText(r)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="muted small">
            Conversões seguem a definição de cada plataforma e podem se sobrepor; não some com o GA4.
          </p>
        </div>
      </div>
    </section>
  );
}

function AnalysisBlock({ analysis }: { analysis: ReportAnalysis | null }) {
  if (!analysis) return null;
  const lists: [string, string[]][] = [
    ["Destaques", analysis.destaques],
    ["Pontos de atenção", analysis.pontos_de_atencao],
    ["Recomendações", analysis.recomendacoes],
  ];
  return (
    <section className="card report-section analysis-card">
      <h2>Resumo executivo</h2>
      <p className="analysis-text">{analysis.resumo}</p>
      <div className="analysis-grid">
        {lists.map(([title, items]) =>
          items.length ? (
            <div key={title}>
              <h3>{title}</h3>
              <ul>{items.map((t, i) => <li key={i}>{t}</li>)}</ul>
            </div>
          ) : null,
        )}
      </div>
    </section>
  );
}

/** Vendas do CRM com o investimento em anúncios do mesmo relatório (ROAS real). */
function Sales({ data }: { data: ReportData }) {
  if (data.sellbot?.status !== "ok") return null;
  if (data.sellbot.data.v !== 2) {
    return (
      <section className="card report-section">
        <h2>Vendas — Sellbot (CRM)</h2>
        <p className="muted" style={{ margin: 0 }}>
          Este relatório usa o formato antigo das vendas (pela data do ganho). Gere um novo relatório para ver leads, vendas e UTMs
          pela data de criação.
        </p>
      </section>
    );
  }
  const paid = [data.meta, data.googleAds].flatMap((r) => (r.status === "ok" ? [r.data] : []));
  const currency = paid[0]?.currency ?? "BRL";
  const same = paid.every((p) => p.currency === currency);
  const spend = paid.length && same ? paid.reduce((a, p) => a + p.totals.spend, 0) : null;
  const spendPrev = paid.length && same ? paid.reduce((a, p) => a + p.previousTotals.spend, 0) : null;
  const conversions = paid.length ? paid.reduce((a, p) => a + p.totals.conversions, 0) : null;
  const campaigns: AdCampaignRef[] = [
    ...(data.meta.status === "ok" ? data.meta.data.campaigns.map((c) => ({ id: c.id, name: c.name, platform: "Meta Ads" as const, spend: c.spend })) : []),
    ...(data.googleAds.status === "ok" ? data.googleAds.data.campaigns.map((c) => ({ id: c.id, name: c.name, platform: "Google Ads" as const, spend: c.spend })) : []),
  ];
  return (
    <SellbotSection data={data.sellbot.data} range={data.range} currency={currency} adSpend={spend} adSpendPrev={spendPrev}
      adConversions={conversions} campaigns={campaigns} />
  );
}

/* ---------- relatório ---------- */

export default function ReportView({ data, analysis }: { data: ReportData; analysis: ReportAnalysis | null }) {
  return (
    <article className="report stack">
      <header className="report-hero">
        <div>
          <span className="eyebrow" style={{ color: "#88A8A5" }}>Relatório de performance</span>
          <h1>{data.client.name}</h1>
          <p className="period">
            {formatDateBr(data.range.start)} a {formatDateBr(data.range.end)}
          </p>
          <p className="meta-line">
            Comparado a {formatDateBr(data.previousRange.start)} – {formatDateBr(data.previousRange.end)} · gerado em{" "}
            {new Date(data.generatedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
          </p>
        </div>
        <div className="by">
          <span>Preparado por</span>
          <Logo variant="onDark" height={30} />
        </div>
      </header>

      {data.demo && (
        <p className="demo-banner" role="note">
          ⚠ Dados de demonstração: números fictícios, gerados sem consultar as plataformas. Não compartilhe com clientes.
        </p>
      )}

      <AnalysisBlock analysis={analysis} />
      <Overview data={data} />
      <Sales data={data} />
      {data.sellbot && <Unavailable result={data.sellbot} name="Vendas — Sellbot" />}

      {data.meta.status === "ok" && (
        <AdsSection title="Meta Ads" p={data.meta.data} color={COLORS.meta} canal="meta" analysis={analysis} showReach />
      )}
      <Unavailable result={data.meta} name="Meta Ads" />

      {data.googleAds.status === "ok" && (
        <AdsSection title="Google Ads" p={data.googleAds.data} color={COLORS.googleAds} canal="google_ads" analysis={analysis} showReach={false} />
      )}
      <Unavailable result={data.googleAds} name="Google Ads" />

      {data.ga4.status === "ok" && <Ga4Section g={data.ga4.data} analysis={analysis} />}
      <Unavailable result={data.ga4} name="Google Analytics 4" />

      {analysis && (
        <p className="muted small">Textos de análise gerados com apoio de IA a partir dos números deste relatório.</p>
      )}
    </article>
  );
}
