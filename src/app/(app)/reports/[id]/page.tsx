import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requirePermission } from "@/lib/auth";
import { ensureSchema, queryOne } from "@/lib/db";
import { env } from "@/lib/env";
import { deleteReportAction, revokeShareAction, rotateShareAction } from "@/lib/actions/reports";
import CopyLink from "@/components/CopyLink";
import PrintButton from "@/components/PrintButton";
import ReportView from "@/components/report/ReportView";
import { hasSellbot } from "@/lib/platforms/sellbot";
import { sanitizeLayout } from "@/lib/report-template";
import type { ReportAnalysis, ReportData } from "@/lib/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Row {
  id: string;
  client_id: number;
  data: ReportData;
  analysis: ReportAnalysis | null;
  template: unknown;
  share_token: string;
  share_expires_at: Date | null;
  share_revoked: boolean;
}

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("view_reports");
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  await ensureSchema();
  const r = await queryOne<Row>(
    `SELECT id, client_id, data, analysis, template, share_token, share_expires_at, share_revoked
     FROM reports WHERE id = $1`,
    [id],
  );
  if (!r) notFound();

  const template = sanitizeLayout(r.template);
  const shareUrl = new URL(`/r/${r.share_token}`, env().APP_URL).toString();
  const expired = r.share_expires_at !== null && r.share_expires_at < new Date();
  const shareActive = !r.share_revoked && !expired;
  // Relatório salvo antes de o cliente conectar a Sellbot: avisa que um novo relatório traz as vendas.
  const missingSales =
    !(r.data.sellbot?.status === "ok" && r.data.sellbot.data.v === 2) && r.data.sellbot?.status !== "error" && (await hasSellbot(r.client_id));

  return (
    <div className="stack">
      <div className="no-print">
        <Link href="/reports" className="small back-link">← Relatórios</Link>
      </div>

      {can(user, "export_reports") && (
      <section className="card stack no-print">
        <div className="row between">
          <h2>Compartilhamento</h2>
          <span className="badge">
            {r.share_revoked
              ? "link revogado"
              : expired
                ? "link expirado"
                : r.share_expires_at
                  ? `válido até ${r.share_expires_at.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`
                  : "sem expiração"}
          </span>
        </div>
        {shareActive ? (
          <CopyLink url={shareUrl} />
        ) : (
          <p className="muted">O link público está desativado. Gere um novo link para compartilhar.</p>
        )}
        <div className="row">
          <PrintButton />
          <form action={rotateShareAction}>
            <input type="hidden" name="id" value={r.id} />
            <button className="btn" type="submit">{shareActive ? "Gerar novo link (invalida o atual)" : "Gerar novo link"}</button>
          </form>
          {shareActive && (
            <form action={revokeShareAction}>
              <input type="hidden" name="id" value={r.id} />
              <button className="btn danger" type="submit">Revogar link</button>
            </form>
          )}
          <form action={deleteReportAction} className="row">
            <input type="hidden" name="id" value={r.id} />
            <label className="checkbox small">
              <input type="checkbox" name="confirm" required /> confirmar
            </label>
            <button className="btn danger" type="submit">Excluir relatório</button>
          </form>
        </div>
      </section>
      )}

      {missingSales && (
        <p className="notice no-print" role="note">
          Este relatório foi gerado antes da versão atual da integração com a Sellbot (leads, vendas e UTMs pela data de criação).{" "}
          <Link href={`/reports?client=${r.client_id}&start=${r.data.range.start}&end=${r.data.range.end}`}>
            Gere um novo relatório do mesmo período
          </Link>{" "}
          para incluir vendas, funis e UTMs.
        </p>
      )}

      {template && (
        <p className="muted small no-print" style={{ margin: 0 }}>Gerado com o modelo <strong>{(r.template as { name?: string }).name ?? "personalizado"}</strong>.</p>
      )}

      {!r.analysis && template?.sections.analysis !== false && (
        <p className="muted no-print">
          A análise em texto não foi gerada (chave da Claude ausente, sem dados ou falha temporária). Números e gráficos estão completos.
        </p>
      )}

      <ReportView data={r.data} analysis={r.analysis} template={template} />
    </div>
  );
}
