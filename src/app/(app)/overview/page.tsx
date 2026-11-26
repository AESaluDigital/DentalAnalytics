import { Suspense } from "react";
import Link from "next/link";
import { can, requirePermission, type SessionUser } from "@/lib/auth";
import { todayIso, addDays } from "@/lib/dates";
import { int, money, pct } from "@/lib/format";
import { attentionReasons, BUDGET_TOLERANCE, getOverview, monthRange, type AttentionReason, type Overview, type OverviewClient } from "@/lib/overview";
import { listComments, type AttentionComment } from "@/lib/attention";
import { addCommentAction, replyAction, setStatusAction } from "@/lib/actions/attention";
import HideNamesToggle from "@/components/HideNamesToggle";
import InfoTip from "@/components/InfoTip";
import { METRIC_HELP } from "@/lib/metric-help";

export const dynamic = "force-dynamic";
/** Consulta Meta e Google Ads de todos os clientes. */
export const maxDuration = 120;

type Search = Promise<{ month?: string; refresh?: string }>;

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}`;

const when = (d: Date) =>
  d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Nome do cliente que some quando o olho está fechado (fica o apelido "Cliente 07"). */
function CName({ name, alias, strong = true }: { name: string; alias: string; strong?: boolean }) {
  const Tag = strong ? "strong" : "span";
  return (
    <Tag className="cname">
      <span className="cname-real">{name}</span>
      <span className="cname-alias" aria-hidden>{alias}</span>
    </Tag>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="client-avatar" aria-hidden>
      <span className="cname-real">{name.trim().charAt(0).toUpperCase()}</span>
      <span className="cname-alias">•</span>
    </span>
  );
}

function Platforms({ c }: { c: OverviewClient }) {
  const p = c.platforms;
  return (
    <span className="row" style={{ gap: 4 }}>
      {p.meta && <span className="badge meta">Meta</span>}
      {p.google && <span className="badge gads">Google</span>}
      {p.ga4 && <span className="badge ga4">GA4</span>}
      {p.sellbot && <span className="badge sellbot">Sellbot</span>}
      {!p.meta && !p.google && !p.ga4 && !p.sellbot && <span className="badge">sem contas</span>}
    </span>
  );
}

function Th({ label, help, num = true }: { label: string; help?: keyof typeof METRIC_HELP; num?: boolean }) {
  return (
    <th className={num ? "num" : undefined}>
      <span className="th-help">{label}{help && <InfoTip label={label} text={METRIC_HELP[help]} />}</span>
    </th>
  );
}

function paceText(c: OverviewClient) {
  if (c.pace === null) return <span className="muted">sem orçamento</span>;
  const out = Math.abs(c.pace) > BUDGET_TOLERANCE;
  return (
    <span className={out ? "error" : undefined} title={`${money(c.totals.spend, c.currency)} investidos de ${money(c.expected, c.currency)} previstos até agora (orçamento do mês: ${money(c.budget, c.currency)})`}>
      {c.pace >= 0 ? "+" : "−"}{pct(Math.abs(c.pace))}
    </span>
  );
}

/* ---------- Comentários ---------- */

function CommentForm({ clientId, back, compact = false }: { clientId: number; back: string; compact?: boolean }) {
  return (
    <form action={addCommentAction} className={compact ? "stack comment-form compact" : "stack comment-form"}>
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="back" value={back} />
      <textarea name="body" required maxLength={2000} rows={compact ? 2 : 3} placeholder="Descreva o ponto de atenção…" aria-label="Comentário" />
      <div className="row"><button className="btn primary" type="submit">Comentar</button></div>
    </form>
  );
}

const STATUS_LABEL = { open: "em aberto", resolved: "concluído", dismissed: "descartado" } as const;

function Thread({ c, back }: { c: AttentionComment; back: string }) {
  const open = c.status === "open";
  return (
    <article id={`comentario-${c.id}`} className={`comment status-${c.status}`}>
      <header className="row between">
        <span className="small">
          <strong>{c.author ?? "Usuário removido"}</strong> <span className="muted">· {when(c.createdAt)}</span>
        </span>
        <span className={`badge comment-badge-${c.status}`}>{STATUS_LABEL[c.status]}</span>
      </header>
      <p className="comment-body">{c.body}</p>
      {c.replies.map((r) => (
        <div key={r.id} className="reply">
          <span className="small"><strong>{r.author ?? "Usuário removido"}</strong> <span className="muted">· {when(r.createdAt)}</span></span>
          <p className="comment-body">{r.body}</p>
        </div>
      ))}
      {!open && c.closedAt && (
        <p className="muted small" style={{ margin: 0 }}>{STATUS_LABEL[c.status]} por {c.closedBy ?? "—"} em {when(c.closedAt)}</p>
      )}
      <div className="row comment-actions">
        <form action={replyAction} className="row reply-form">
          <input type="hidden" name="commentId" value={c.id} />
          <input type="hidden" name="back" value={back} />
          <input name="body" required maxLength={2000} placeholder="Responder…" aria-label="Resposta" />
          <button className="btn" type="submit">Responder</button>
        </form>
        <form action={setStatusAction} className="row" style={{ gap: 6 }}>
          <input type="hidden" name="commentId" value={c.id} />
          <input type="hidden" name="back" value={back} />
          {open ? (
            <>
              <button className="btn good-btn" type="submit" name="status" value="resolved">✓ Concluir</button>
              <button className="btn" type="submit" name="status" value="dismissed">Descartar</button>
            </>
          ) : (
            <button className="btn" type="submit" name="status" value="open">Reabrir</button>
          )}
        </form>
      </div>
    </article>
  );
}

/* ---------- Corpo (dados ao vivo) ---------- */

function MiniStat({ label, value, help, tone }: { label: string; value: string; help?: keyof typeof METRIC_HELP; tone?: "bad" }) {
  return (
    <div className={`mini-stat${tone ? ` ${tone}` : ""}`}>
      <span className="muted small th-help">{label}{help && <InfoTip label={label} text={METRIC_HELP[help]} />}</span>
      <strong>{value}</strong>
    </div>
  );
}

async function Body({ user, monthParam, force, back }: { user: SessionUser; monthParam: string | undefined; force: boolean; back: string }) {
  let data: Overview;
  let comments: AttentionComment[];
  try {
    [data, comments] = await Promise.all([getOverview(monthParam, force), listComments()]);
  } catch (err) {
    console.error("[overview] falha", err);
    return <div className="card"><p className="error" style={{ margin: 0 }}>⚠ Não foi possível carregar a visão geral.</p></div>;
  }

  const canDash = can(user, "view_reports");
  const dashHref = (id: number) => `/dashboard?${new URLSearchParams({ client: String(id), start: data.range.start, end: data.range.end })}`;
  const fmt = { pct: (v: number) => pct(v), money: (v: number) => money(v) };
  // Apelido estável (pela ordem de cadastro), para o olho fechado.
  const aliasOf = new Map([...data.clients].sort((a, b) => a.id - b.id).map((c, i) => [c.id, `Cliente ${String(i + 1).padStart(2, "0")}`]));

  const openByClient = new Map<number, AttentionComment[]>();
  const closedByClient = new Map<number, AttentionComment[]>();
  for (const c of comments) {
    const m = c.status === "open" ? openByClient : closedByClient;
    m.set(c.clientId, [...(m.get(c.clientId) ?? []), c]);
  }

  const attention = data.clients
    .map((c) => {
      const reasons: AttentionReason[] = attentionReasons(c, data.averages, fmt);
      const open = openByClient.get(c.id) ?? [];
      if (open.length) reasons.push({ key: "comment", text: `${open.length} comentário(s) em aberto` });
      return { c, reasons, open, closed: closedByClient.get(c.id) ?? [] };
    })
    .filter((x) => x.reasons.length > 0)
    .sort((a, b) => b.open.length - a.open.length || b.reasons.length - a.reasons.length || b.c.totals.spend - a.c.totals.spend);

  const sum = data.clients.reduce(
    (a, c) => ({ spend: a.spend + c.totals.spend, conv: a.conv + c.totals.conversions, clicks: a.clicks + c.totals.clicks }),
    { spend: 0, conv: 0, clicks: 0 },
  );
  const avg = data.averages;
  const nameCell = (c: OverviewClient) => (
    <div className="row" style={{ flexWrap: "nowrap", gap: 10 }}>
      <Avatar name={c.name} />
      <div style={{ minWidth: 0 }}>
        {canDash ? <Link href={dashHref(c.id)}><CName name={c.name} alias={aliasOf.get(c.id)!} /></Link> : <CName name={c.name} alias={aliasOf.get(c.id)!} />}
        <div style={{ marginTop: 4 }}><Platforms c={c} /></div>
      </div>
    </div>
  );

  return (
    <>
      <span className="muted small">
        {monthLabel(data.month)}{data.monthFraction < 1 ? " (até hoje)" : ""} · Meta Ads + Google Ads · consultado às{" "}
        {new Date(data.fetchedAt).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}
      </span>

      <div className="kpi-grid">
        <div className="kpi"><span className="kpi-label">Investimento total</span><span className="kpi-value">{money(sum.spend)}</span>
          <span className="kpi-delta"><span className="muted">{data.clients.filter((c) => c.totals.spend > 0).length} clientes com investimento</span></span></div>
        <div className="kpi"><span className="kpi-label">Conversões</span><span className="kpi-value">{int(sum.conv)}</span></div>
        <div className="kpi"><span className="kpi-label">CPL médio dos clientes<InfoTip label="CPL médio" text="Média simples do CPL dos clientes com investimento no período (cada cliente pesa igual). É a régua do ponto de atenção." /></span>
          <span className="kpi-value">{money(avg.cpl)}</span></div>
        <div className="kpi"><span className="kpi-label">% conversão média<InfoTip label="% conversão média" text="Média simples da taxa de conversão (conversões ÷ cliques) dos clientes com investimento no período. É a régua do ponto de atenção." /></span>
          <span className="kpi-value">{pct(avg.conversionRate)}</span></div>
        <div className={`kpi${attention.length ? " kpi-tone-warn" : ""}`}><span className="kpi-label">Em ponto de atenção</span>
          <span className="kpi-value">{int(attention.length)}</span><span className="kpi-delta"><span className="muted">de {data.clients.length} clientes</span></span></div>
      </div>

      {/* ---------- Pontos de atenção ---------- */}
      <section className="card stack" id="atencao">
        <div className="row between">
          <h2 style={{ margin: 0 }}>Pontos de atenção</h2>
          <span className="muted small">
            Regras: % conversão abaixo da média · CPL acima da média · investimento fora de ±{pct(BUDGET_TOLERANCE, 0)} do orçado · comentário em aberto
          </span>
        </div>
        {attention.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>Nenhum cliente em ponto de atenção. 🎉</p>
        ) : (
          <div className="attention-list">
            {attention.map(({ c, reasons, open, closed }) => (
              <article key={c.id} id={`atencao-${c.id}`} className="attention-card">
                <div className="row between" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
                  {nameCell(c)}
                  {canDash && <Link className="btn" href={dashHref(c.id)}>Dashboard →</Link>}
                </div>
                <ul className="reasons">
                  {reasons.map((r) => <li key={r.key} className={`reason reason-${r.key}`}>{r.text}</li>)}
                </ul>
                <div className="mini-stats">
                  <MiniStat label="Investimento" value={money(c.totals.spend, c.currency)} />
                  <MiniStat label="% conversão" help="conversionRate" value={pct(c.kpis.conversionRate)}
                    tone={reasons.some((r) => r.key === "conversion") ? "bad" : undefined} />
                  <MiniStat label="CPL" help="cpl" value={money(c.kpis.cpl, c.currency)} tone={reasons.some((r) => r.key === "cpl") ? "bad" : undefined} />
                  <MiniStat label="vs. orçado" value={c.pace === null ? "—" : `${c.pace >= 0 ? "+" : "−"}${pct(Math.abs(c.pace))}`}
                    tone={reasons.some((r) => r.key === "budget") ? "bad" : undefined} />
                </div>
                {c.errors.length > 0 && <p className="error small" style={{ margin: 0 }}>⚠ {c.errors.join(" · ")}</p>}
                {open.map((cm) => <Thread key={cm.id} c={cm} back={back} />)}
                {closed.length > 0 && (
                  <details className="closed-comments">
                    <summary className="muted small">{closed.length} comentário(s) concluído(s)/descartado(s) recentemente</summary>
                    {closed.map((cm) => <Thread key={cm.id} c={cm} back={back} />)}
                  </details>
                )}
                <details className="add-comment">
                  <summary className="btn">💬 Comentar ponto de atenção</summary>
                  <CommentForm clientId={c.id} back={back} />
                </details>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* ---------- Todos os clientes ---------- */}
      <section className="card stack">
        <h2 style={{ margin: 0 }}>Todos os clientes</h2>
        <div className="table-wrap overview-table">
          <table>
            <thead>
              <tr>
                <Th label="Cliente" num={false} />
                <Th label="Investimento" help="spendTotal" />
                <Th label="Conversões" help="conversions" />
                <Th label="CPL" help="cpl" />
                <Th label="CPC" help="cpc" />
                <Th label="% cliques" help="ctr" />
                <Th label="% conversão" help="conversionRate" />
                <Th label="ROAS" help="roas" />
                <Th label="vs. orçado" />
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {data.clients.map((c) => {
                const k = c.kpis;
                const has = c.totals.spend > 0;
                const crBad = has && avg.conversionRate !== null && (k.conversionRate ?? 0) < avg.conversionRate;
                const cplBad = has && avg.cpl !== null && (k.cpl === null || k.cpl > avg.cpl);
                const openN = openByClient.get(c.id)?.length ?? 0;
                return (
                  <tr key={c.id}>
                    <td className="name">
                      {nameCell(c)}
                      {c.errors.length > 0 && <div className="error small" title={c.errors.join(" · ")}>⚠ falha ao consultar</div>}
                    </td>
                    <td className="num">{money(c.totals.spend, c.currency)}</td>
                    <td className="num">{int(c.totals.conversions)}</td>
                    <td className={`num${cplBad ? " cell-bad" : ""}`}>{money(k.cpl, c.currency)}</td>
                    <td className="num">{money(k.cpc, c.currency)}</td>
                    <td className="num">{pct(k.ctr, 2)}</td>
                    <td className={`num${crBad ? " cell-bad" : ""}`}>{pct(k.conversionRate, 2)}</td>
                    <td className="num">{k.roas === null || k.roas === 0 ? "—" : `${k.roas.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}x`}</td>
                    <td className="num">{paceText(c)}</td>
                    <td>
                      <div className="row" style={{ flexWrap: "nowrap", gap: 6, justifyContent: "flex-end" }}>
                        <details className="row-comment">
                          <summary className="btn icon" title="Comentar ponto de atenção" aria-label="Comentar ponto de atenção">
                            💬{openN > 0 && <span className="count-dot">{openN}</span>}
                          </summary>
                          <div className="row-comment-pop card">
                            <CommentForm clientId={c.id} back={back} compact />
                          </div>
                        </details>
                        {canDash && <Link className="btn" href={dashHref(c.id)}>Abrir →</Link>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          Investimento e conversões somam Meta Ads e Google Ads. “vs. orçado” compara o investimento com o orçamento do mês proporcional aos dias
          {data.monthFraction < 1 ? " já passados" : ""}. Destaques em vermelho ficam piores que a média dos clientes.
        </p>
      </section>
    </>
  );
}

export default async function OverviewPage({ searchParams }: { searchParams: Search }) {
  const user = await requirePermission("view_overview");
  const sp = await searchParams;
  const today = todayIso();
  const { month } = monthRange(sp.month, today);
  const m = month.slice(0, 7);
  const current = today.slice(0, 7);
  const last = addDays(`${current}-01`, -1).slice(0, 7);
  const back = `/overview?month=${m}`;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <span className="eyebrow">Carteira</span>
          <h1>Visão geral</h1>
          <p className="muted small" style={{ margin: "4px 0 0" }}>Todos os clientes com as métricas básicas do mês e os que precisam de atenção.</p>
        </div>
        <div className="row no-print">
          <HideNamesToggle />
          <div className="seg" role="group" aria-label="Mês">
            <Link className="btn" href={`/overview?month=${current}`} aria-pressed={m === current}>Mês atual</Link>
            <Link className="btn" href={`/overview?month=${last}`} aria-pressed={m === last}>Mês passado</Link>
          </div>
          <form action="/overview" className="row" style={{ gap: 6 }}>
            <input type="month" name="month" defaultValue={m} max={current} aria-label="Escolher mês" />
            <button className="btn" type="submit">Ver</button>
          </form>
          <Link className="btn" href={`/overview?month=${m}&refresh=${Date.now()}`} title="Consultar as plataformas de novo">↻ Atualizar</Link>
        </div>
      </div>

      <Suspense key={`${m}|${sp.refresh ?? ""}`} fallback={<div className="card dash-loading" role="status">Consultando Meta e Google Ads de todos os clientes…</div>}>
        <Body user={user} monthParam={m} force={Boolean(sp.refresh)} back={back} />
      </Suspense>
    </div>
  );
}
