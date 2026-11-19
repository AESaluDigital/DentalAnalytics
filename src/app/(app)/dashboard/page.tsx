import { Suspense } from "react";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { addDays, daysBetween, isIsoDate, todayIso } from "@/lib/dates";
import { getLiveData } from "@/lib/report/live";
import DashboardToolbar from "@/components/DashboardToolbar";
import SnapshotButton from "@/components/SnapshotButton";
import PrintButton from "@/components/PrintButton";
import ReportView from "@/components/report/ReportView";
import type { ClientRow } from "@/lib/types";

export const dynamic = "force-dynamic";

const CLIENT_COLS =
  "id, name, meta_ad_account_id, meta_conversion_action, google_ads_customer_id, ga4_property_id, active";

type Search = Promise<{ client?: string; start?: string; end?: string; refresh?: string }>;

function resolveRange(start: string | undefined, end: string | undefined, today: string) {
  const fallback = { start: addDays(today, -29), end: today };
  if (!start || !end || !isIsoDate(start) || !isIsoDate(end)) return fallback;
  if (start > end || end > today || daysBetween({ start, end }) > 366) return fallback;
  return { start, end };
}

async function LiveData({ client, start, end, force }: { client: ClientRow; start: string; end: string; force: boolean }) {
  const { data, fetchedAt } = await getLiveData(client, { start, end }, force);
  return (
    <>
      <div className="row between no-print">
        <span className="muted small">
          Dados consultados nas plataformas às{" "}
          {new Date(fetchedAt).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" })}
        </span>
        <div className="row">
          <PrintButton />
          <SnapshotButton clientId={client.id} start={start} end={end} />
        </div>
      </div>
      <ReportView data={data} analysis={null} />
    </>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Search }) {
  const user = await requireUser();
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
          {user.role === "admin" && <Link href="/clients/new">Cadastrar cliente</Link>}
        </p>
      </div>
    );
  }

  const requested = Number(sp.client);
  const clientId = clients.some((c) => c.id === requested) ? requested : clients[0].id;
  const client = (await queryOne<ClientRow>(`SELECT ${CLIENT_COLS} FROM clients WHERE id = $1`, [clientId]))!;
  const hasAccounts = client.meta_ad_account_id || client.google_ads_customer_id || client.ga4_property_id;

  return (
    <div className="stack">
      <DashboardToolbar clients={clients} clientId={clientId} start={start} end={end} today={today} />

      {!hasAccounts ? (
        <div className="card">
          <p className="muted">
            {client.name} não tem contas vinculadas.{" "}
            {user.role === "admin" && <Link href={`/clients/${client.id}/edit`}>Vincular contas</Link>}
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
          <LiveData client={client} start={start} end={end} force={Boolean(sp.refresh)} />
        </Suspense>
      )}
    </div>
  );
}
