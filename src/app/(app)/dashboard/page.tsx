import { Suspense } from "react";
import Link from "next/link";
import { can, requirePermission } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { addDays, daysBetween, isIsoDate, todayIso } from "@/lib/dates";
import { getLiveData } from "@/lib/report/live";
import { hasSellbot } from "@/lib/platforms/sellbot";
import DashboardToolbar from "@/components/DashboardToolbar";
import ReportView from "@/components/report/ReportView";
import type { ClientRow, PlatformResult, ReportData } from "@/lib/types";

export const dynamic = "force-dynamic";
/** Consulta ao vivo das plataformas (Meta, Google Ads, GA4) pode passar do tempo padrão da Vercel. */
export const maxDuration = 120;

const CLIENT_COLS =
  "id, name, meta_ad_account_id, meta_conversion_action, google_ads_customer_id, ga4_property_id, active";

type Search = Promise<{ client?: string; start?: string; end?: string; refresh?: string }>;

function resolveRange(start: string | undefined, end: string | undefined, today: string) {
  const fallback = { start: addDays(today, -29), end: today };
  if (!start || !end || !isIsoDate(start) || !isIsoDate(end)) return fallback;
  if (start > end || end > today || daysBetween({ start, end }) > 366) return fallback;
  return { start, end };
}

/** Faixa com o estado de cada fonte de dados do cliente (conectada, com erro ou não vinculada). */
function Sources({ data, clientId, canManage }: { data: ReportData; clientId: number; canManage: boolean }) {
  const items: [string, PlatformResult<unknown> | undefined, string][] = [
    ["Meta Ads", data.meta, `/clients/${clientId}/edit`],
    ["Google Ads", data.googleAds, `/clients/${clientId}/edit`],
    ["GA4", data.ga4, `/clients/${clientId}/edit`],
    ["Sellbot", data.sellbot, "/settings/sellbot"],
  ];
  return (
    <div className="sources no-print" aria-label="Fontes de dados">
      {items.map(([name, r, href]) => {
        const st = r?.status ?? "not_configured";
        const label = st === "ok" ? "conectada" : st === "error" ? "erro" : "não vinculada";
        const chip = <span className={`source source-${st}`} title={r?.status === "error" ? r.message : undefined}>
          <i aria-hidden /> {name}: {label}
        </span>;
        return st === "not_configured" && canManage ? <Link key={name} href={href}>{chip}</Link> : <span key={name}>{chip}</span>;
      })}
    </div>
  );
}

async function LiveData({ client, start, end, force, canExport, canManage }: { client: ClientRow; start: string; end: string; force: boolean; canExport: boolean; canManage: boolean }) {
  const { data, fetchedAt } = await getLiveData(client, { start, end }, force);
  return (
    <>
      <div className="row between no-print">
        <span className="muted small">
          Dados consultados nas plataformas às{" "}
          {new Date(fetchedAt).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" })}
        </span>
        {canExport && (
          // Dashboard é só visualização; relatórios (inclusive em massa) são gerados na tela Relatórios.
          <Link className="btn" href={`/reports?client=${client.id}&start=${start}&end=${end}`}>
            Gerar relatório na tela Relatórios →
          </Link>
        )}
      </div>
      <Sources data={data} clientId={client.id} canManage={canManage} />
      <ReportView data={data} analysis={null} />
    </>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Search }) {
  const user = await requirePermission("view_reports");
  const sp = await searchParams;
  const today = todayIso();
  const { start, end } = resolveRange(sp.start, sp.end, today);

  const clients = await query<{ id: number; name: string }>(
    "SELECT id, name FROM clients WHERE active ORDER BY lower(name)",
  );

  if (clients.length === 0) {
    return (
      <div className="stack">
        <h1>Dashboard</h1>
        <p className="muted">
          Nenhum cliente ativo cadastrado.{" "}
          {can(user, "manage_clients") && <Link href="/clients/new">Cadastrar cliente</Link>}
        </p>
      </div>
    );
  }

  const requested = Number(sp.client);
  const clientId = clients.some((c) => c.id === requested) ? requested : clients[0].id;
  const client = (await queryOne<ClientRow>(`SELECT ${CLIENT_COLS} FROM clients WHERE id = $1`, [clientId]))!;
  const hasAccounts =
    client.meta_ad_account_id || client.google_ads_customer_id || client.ga4_property_id || (await hasSellbot(client.id));

  return (
    <div className="stack">
      <DashboardToolbar clients={clients} clientId={clientId} start={start} end={end} today={today} />

      {!hasAccounts ? (
        <div className="card">
          <p className="muted">
            {client.name} não tem contas vinculadas.{" "}
            {can(user, "manage_clients") && <Link href={`/clients/${client.id}/edit`}>Vincular contas</Link>}
          </p>
        </div>
      ) : (
        <Suspense
          key={`${clientId}|${start}|${end}|${sp.refresh ?? ""}`}
          fallback={
            <div className="card dash-loading" role="status">
              Consultando Meta, Google Ads e GA4 de {client.name}…
            </div>
          }
        >
          <LiveData client={client} start={start} end={end} force={Boolean(sp.refresh)} canExport={can(user, "export_reports")}
            canManage={can(user, "manage_clients") || can(user, "manage_integrations")} />
        </Suspense>
      )}
    </div>
  );
}
