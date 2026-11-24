import Link from "next/link";
import { can, requirePermission } from "@/lib/auth";
import { query } from "@/lib/db";
import { formatDateBr, isIsoDate, todayIso } from "@/lib/dates";
import BulkReports from "@/components/BulkReports";

export const dynamic = "force-dynamic";
export const metadata = { title: "Relatórios" };
/** A geração (uma chamada por cliente) consulta as plataformas e a IA. */
export const maxDuration = 300;

interface Row {
  id: string;
  client_id: number;
  client: string;
  period_start: string;
  period_end: string;
  created_at: Date;
  author: string | null;
  has_analysis: boolean;
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ client?: string; start?: string; end?: string }> }) {
  const user = await requirePermission("view_reports");
  const sp = await searchParams;
  const clientId = Number(sp.client);
  const filter = Number.isInteger(clientId) && clientId > 0 ? clientId : null;

  const [clients, reports] = await Promise.all([
    query<{ id: number; name: string; active: boolean; has_accounts: boolean }>(
      `SELECT id, name, active,
              (meta_ad_account_id IS NOT NULL OR google_ads_customer_id IS NOT NULL OR ga4_property_id IS NOT NULL) AS has_accounts
       FROM clients ORDER BY lower(name)`,
    ),
    query<Row>(
      `SELECT r.id, r.client_id, c.name AS client, r.period_start, r.period_end, r.created_at,
              u.name AS author, (r.analysis IS NOT NULL) AS has_analysis
       FROM reports r JOIN clients c ON c.id = r.client_id LEFT JOIN users u ON u.id = r.created_by
       WHERE ($1::int IS NULL OR r.client_id = $1)
       ORDER BY r.created_at DESC LIMIT 200`,
      [filter],
    ),
  ]);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <span className="eyebrow">Histórico</span>
          <h1>Relatórios</h1>
        </div>
      </div>

      {can(user, "export_reports") && (
        <BulkReports
          clients={clients.filter((c) => c.active).map((c) => ({ id: c.id, name: c.name, hasAccounts: c.has_accounts }))}
          today={todayIso()}
          initial={{
            clientId: filter,
            start: sp.start && isIsoDate(sp.start) ? sp.start : null,
            end: sp.end && isIsoDate(sp.end) ? sp.end : null,
          }}
        />
      )}

      <div className="page-head">
        <h2>Relatórios gerados</h2>
      </div>

      <form className="card row" style={{ padding: 14 }}>
        <label className="sr-only" htmlFor="rep-client">Cliente</label>
        <select id="rep-client" name="client" defaultValue={filter ?? ""} style={{ flex: "1 1 260px" }}>
          <option value="">Todos os clientes</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className="btn" type="submit">Filtrar</button>
      </form>

      <div className="card">
        {reports.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>Nenhum relatório gerado ainda.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Cliente</th><th>Período</th><th>Gerado em</th><th>Por</th><th>Análise IA</th><th /></tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id}>
                    <td className="name"><Link href={`/clients/${r.client_id}`}>{r.client}</Link></td>
                    <td>{formatDateBr(r.period_start)} – {formatDateBr(r.period_end)}</td>
                    <td>{r.created_at.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td>
                    <td>{r.author ?? "—"}</td>
                    <td>{r.has_analysis ? <span className="badge status-ok">sim</span> : <span className="muted">—</span>}</td>
                    <td className="actions"><Link className="btn small-btn" href={`/reports/${r.id}`}>Abrir</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
