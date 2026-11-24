import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { formatDateBr, todayIso } from "@/lib/dates";
import GenerateReportForm from "@/components/GenerateReportForm";
import type { ClientRow } from "@/lib/types";

interface ReportListRow {
  id: string;
  period_start: string;
  period_end: string;
  created_at: Date;
  author: string | null;
  has_analysis: boolean;
}

/** Gerar relatório consulta as plataformas e a análise da IA; na Vercel o padrão de tempo é curto demais. */
export const maxDuration = 300;

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();

  const client = await queryOne<ClientRow>(
    `SELECT id, name, meta_ad_account_id, meta_conversion_action, google_ads_customer_id, ga4_property_id, active
     FROM clients WHERE id = $1`,
    [id],
  );
  if (!client) notFound();

  const reports = await query<ReportListRow>(
    `SELECT r.id, r.period_start, r.period_end, r.created_at, u.name AS author, (r.analysis IS NOT NULL) AS has_analysis
     FROM reports r LEFT JOIN users u ON u.id = r.created_by
     WHERE r.client_id = $1 ORDER BY r.created_at DESC LIMIT 50`,
    [id],
  );

  const accounts = [
    { label: "Meta Ads", value: client.meta_ad_account_id ? `act_${client.meta_ad_account_id}` : null,
      extra: client.meta_ad_account_id ? `conversão: ${client.meta_conversion_action}` : null },
    { label: "Google Ads", value: client.google_ads_customer_id?.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3") ?? null, extra: null },
    { label: "GA4", value: client.ga4_property_id ? `properties/${client.ga4_property_id}` : null, extra: null },
  ];

  return (
    <div className="stack">
      <div className="row between">
        <div>
          <Link href="/" className="small">← Clientes</Link>
          <h1>{client.name}</h1>
        </div>
        <div className="row">
          <Link className="btn primary" href={`/dashboard?client=${client.id}`}>Abrir no dashboard</Link>
          {user.role === "admin" && <Link className="btn" href={`/clients/${client.id}/edit`}>Editar</Link>}
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 12 }}>Contas vinculadas</h2>
        <div className="table-wrap">
          <table>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.label}>
                  <th scope="row">{a.label}</th>
                  <td>{a.value ?? <span className="muted">não vinculada</span>}</td>
                  <td className="muted">{a.extra}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <GenerateReportForm clientId={client.id} today={todayIso()} />

      <div className="card">
        <h2 style={{ marginBottom: 12 }}>Relatórios gerados</h2>
        {reports.length === 0 ? (
          <p className="muted">Nenhum relatório ainda.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Período</th><th>Gerado em</th><th>Por</th><th>Análise</th><th /></tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id}>
                    <td>{formatDateBr(r.period_start)} – {formatDateBr(r.period_end)}</td>
                    <td>{r.created_at.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td>
                    <td>{r.author ?? "—"}</td>
                    <td>{r.has_analysis ? "sim" : <span className="muted">indisponível</span>}</td>
                    <td><Link href={`/reports/${r.id}`}>Abrir</Link></td>
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
