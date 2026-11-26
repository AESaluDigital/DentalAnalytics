import { Suspense } from "react";
import Link from "next/link";
import { can, requirePermission } from "@/lib/auth";
import { query } from "@/lib/db";
import { addDays, daysBetween, formatDateBr, isIsoDate, todayIso } from "@/lib/dates";
import { fetchSellbotLeads, fetchSellbotLeadsByPeriod, listSellbotConnections, type SellbotLead } from "@/lib/platforms/sellbot";
import { PlatformError } from "@/lib/platforms/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PER_PAGE = 25;

type Search = Promise<{ client?: string; q?: string; page?: string; start?: string; end?: string; all?: string }>;
type Range = { start: string; end: string };

/** Período pedido; sem datas válidas = últimos 30 dias. "all=1" = todos os leads, sem período. */
function resolveRange(sp: { start?: string; end?: string; all?: string }, today: string): Range | null {
  if (sp.all === "1") return null;
  const { start, end } = sp;
  const fallback = { start: addDays(today, -29), end: today };
  if (!start || !end || !isIsoDate(start) || !isIsoDate(end)) return fallback;
  if (start > end || end > today || daysBetween({ start, end }) > 366) return fallback;
  return { start, end };
}

function presets(today: string) {
  const monthStart = `${today.slice(0, 8)}01`;
  const lastMonthEnd = addDays(monthStart, -1);
  return [
    { label: "Hoje", start: today, end: today },
    { label: "7 dias", start: addDays(today, -6), end: today },
    { label: "30 dias", start: addDays(today, -29), end: today },
    { label: "Mês atual", start: monthStart, end: today },
    { label: "Mês passado", start: `${lastMonthEnd.slice(0, 8)}01`, end: lastMonthEnd },
  ];
}

const STATUS = { open: "em aberto", won: "ganho", lost: "perdido" } as const;

const dateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";

/** Telefone legível (+55 11 99999-8888) e link para o WhatsApp. */
function Phone({ value }: { value: string | null }) {
  if (!value) return <>—</>;
  const digits = value.replace(/\D/g, "");
  const br = digits.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  const text = br ? `(${br[1]}) ${br[2]}-${br[3]}` : `+${digits}`;
  return (
    <a href={`https://wa.me/${digits}`} target="_blank" rel="noopener noreferrer" title="Abrir no WhatsApp">
      {text}
    </a>
  );
}

const dash = (v: string | null) => v ?? <span className="muted">—</span>;

function LeadRow({ l }: { l: SellbotLead }) {
  const metaAd = [l.meta.campaign, l.meta.adset, l.meta.ad].filter(Boolean).join(" › ");
  return (
    <tr>
      <td>{dateTime(l.dateAdded ?? l.dateUpdated)}</td>
      <td className="name">
        <strong>{l.name}</strong>
        {l.isCustomer && <span className="badge good-badge" style={{ marginLeft: 6 }}>cliente</span>}
        {(l.city || l.state) && <div className="muted small">{[l.city, l.state].filter(Boolean).join(" / ")}</div>}
      </td>
      <td><Phone value={l.phone} /></td>
      <td>{l.email ? <a href={`mailto:${l.email}`}>{l.email}</a> : dash(null)}</td>
      <td>{dash(l.channel)}{l.origin && l.origin !== l.channel && <div className="muted small">{l.origin}</div>}</td>
      <td>{dash(l.utm.source)}</td>
      <td>{dash(l.utm.medium)}</td>
      <td className="wrap">{dash(l.utm.campaign ?? l.campaign)}</td>
      <td className="wrap">{dash(l.utm.content)}</td>
      <td className="wrap">{dash(l.utm.term)}</td>
      <td className="wrap">
        {metaAd || l.meta.form ? (
          <>
            {metaAd || "—"}
            {l.meta.form && <div className="muted small">Formulário: {l.meta.form}</div>}
          </>
        ) : dash(null)}
      </td>
      <td>
        {l.deal ? (
          <>
            <span className={`badge status-${l.deal.status}`}>{STATUS[l.deal.status]}</span>
            <div className="muted small">{[l.deal.pipeline, l.deal.status === "open" ? l.deal.stage : null].filter(Boolean).join(" › ")}</div>
          </>
        ) : dash(null)}
      </td>
      <td>{dash(l.owner)}</td>
      <td className="wrap">{l.tags.length ? l.tags.map((t) => <span key={t} className="badge" style={{ marginRight: 4 }}>{t}</span>) : dash(null)}</td>
    </tr>
  );
}

async function LeadsTable({ clientId, q, page, range, base }: { clientId: number; q: string; page: number; range: Range | null; base: URLSearchParams }) {
  let res: Awaited<ReturnType<typeof fetchSellbotLeads>>;
  try {
    res = range
      ? await fetchSellbotLeadsByPeriod(clientId, { page, limit: PER_PAGE, range, search: q || undefined })
      : await fetchSellbotLeads(clientId, { page, limit: PER_PAGE, search: q || undefined });
  } catch (err) {
    return (
      <div className="card">
        <p className="error" style={{ margin: 0 }}>
          ⚠ Não foi possível consultar a Sellbot: {err instanceof PlatformError ? err.message : "erro inesperado"}
        </p>
      </div>
    );
  }
  if (!res) return <div className="card"><p className="muted" style={{ margin: 0 }}>Este cliente não tem Sellbot conectada.</p></div>;

  const pageUrl = (n: number) => {
    const u = new URLSearchParams(base);
    u.set("page", String(n));
    return `/leads?${u}`;
  };
  const partial = res.leads.filter((l) => l.partial).length;

  return (
    <section className="card stack">
      <div className="row between">
        <span className="muted small">
          {res.total.toLocaleString("pt-BR")} lead(s){range ? ` de ${formatDateBr(range.start)} a ${formatDateBr(range.end)}` : " (todos)"} · página {page} de {res.pages}
        </span>
        <div className="row">
          <Link className="btn" href={pageUrl(page - 1)} aria-disabled={page <= 1} tabIndex={page <= 1 ? -1 : undefined}
            style={page <= 1 ? { pointerEvents: "none", opacity: 0.5 } : undefined}>← Anterior</Link>
          <Link className="btn" href={pageUrl(page + 1)} aria-disabled={page >= res.pages} tabIndex={page >= res.pages ? -1 : undefined}
            style={page >= res.pages ? { pointerEvents: "none", opacity: 0.5 } : undefined}>Próxima →</Link>
        </div>
      </div>
      {partial > 0 && (
        <p className="muted small" style={{ margin: 0 }}>
          ⚠ {partial} lead(s) sem detalhe (UTMs) nesta página — a Sellbot não respondeu a tempo. Atualize para tentar de novo.
        </p>
      )}
      {res.leads.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>{range ? "Nenhum lead entrou no CRM neste período." : "Nenhum lead encontrado."}</p>
      ) : (
        <div className="table-wrap leads-table">
          <table>
            <thead>
              <tr>
                <th>Entrada</th>
                <th>Nome</th>
                <th>Telefone</th>
                <th>E-mail</th>
                <th>Canal</th>
                <th>utm_source</th>
                <th>utm_medium</th>
                <th>utm_campaign</th>
                <th>utm_content</th>
                <th>utm_term</th>
                <th>Meta (campanha › conjunto › anúncio)</th>
                <th>Funil</th>
                <th>Responsável</th>
                <th>Tags</th>
              </tr>
            </thead>
            <tbody>
              {res.leads.map((l) => <LeadRow key={l.id} l={l} />)}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default async function LeadsPage({ searchParams }: { searchParams: Search }) {
  const user = await requirePermission("view_leads");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const page = Math.max(1, Math.min(Number(sp.page) || 1, 10_000));
  const today = todayIso();
  const range = resolveRange(sp, today);

  const connections = await listSellbotConnections();
  const clients = (await query<{ id: number; name: string }>("SELECT id, name FROM clients WHERE active ORDER BY lower(name)"))
    .filter((c) => connections.has(c.id));

  if (clients.length === 0) {
    return (
      <div className="stack">
        <h1>Leads</h1>
        <p className="muted">
          Nenhum cliente com Sellbot conectada. Os leads (com contato e UTMs) vêm do CRM Sellbot de cada cliente.{" "}
          {(can(user, "manage_clients") || can(user, "manage_integrations")) && <Link href="/settings/sellbot">Conectar Sellbot</Link>}
        </p>
      </div>
    );
  }

  const requested = Number(sp.client);
  const clientId = clients.some((c) => c.id === requested) ? requested : clients[0].id;
  const base = new URLSearchParams({ client: String(clientId) });
  if (range) {
    base.set("start", range.start);
    base.set("end", range.end);
  } else base.set("all", "1");
  if (q) base.set("q", q);
  const linkFor = (r: Range | null) => {
    const u = new URLSearchParams({ client: String(clientId) });
    if (r) {
      u.set("start", r.start);
      u.set("end", r.end);
    } else u.set("all", "1");
    if (q) u.set("q", q);
    return `/leads?${u}`;
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <span className="eyebrow">CRM Sellbot</span>
          <h1>Leads</h1>
          <p className="muted small" style={{ margin: "4px 0 0" }}>
            O que chegou para o cliente, do mais recente ao mais antigo, com contato, origem (UTMs e anúncio da Meta) e situação no funil.
          </p>
        </div>
      </div>

      <form className="card row no-print" style={{ padding: 14 }} action="/leads">
        <label className="sr-only" htmlFor="leads-client">Cliente</label>
        <select id="leads-client" name="client" defaultValue={clientId} style={{ flex: "1 1 220px" }}>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input type="date" name="start" aria-label="Início" defaultValue={range?.start ?? ""} max={today} />
        <input type="date" name="end" aria-label="Fim" defaultValue={range?.end ?? ""} max={today} />
        <input type="search" name="q" defaultValue={q} placeholder="Buscar por nome, telefone ou e-mail…" aria-label="Buscar lead"
          style={{ flex: "1 1 220px" }} />
        <button className="btn primary" type="submit">Filtrar</button>
      </form>

      <div className="seg no-print" role="group" aria-label="Período" style={{ alignSelf: "flex-start" }}>
        {presets(today).map((p) => {
          const active = range !== null && range.start === p.start && range.end === p.end;
          return (
            <Link key={p.label} className="btn" href={linkFor(p)} aria-pressed={active}>{p.label}</Link>
          );
        })}
        <Link className="btn" href={linkFor(null)} aria-pressed={range === null}>Todos</Link>
      </div>

      <Suspense
        key={`${clientId}|${q}|${page}|${range ? `${range.start}|${range.end}` : "all"}`}
        fallback={<div className="card dash-loading" role="status">Buscando leads na Sellbot…</div>}
      >
        <LeadsTable clientId={clientId} q={q} page={page} range={range} base={base} />
      </Suspense>
    </div>
  );
}
