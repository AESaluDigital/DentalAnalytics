import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { env } from "@/lib/env";
import { deleteReportAction, revokeShareAction, rotateShareAction } from "@/lib/actions/reports";
import CopyLink from "@/components/CopyLink";
import PrintButton from "@/components/PrintButton";
import ReportView from "@/components/report/ReportView";
import type { ReportAnalysis, ReportData } from "@/lib/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Row {
  id: string;
  client_id: number;
  data: ReportData;
  analysis: ReportAnalysis | null;
  share_token: string;
  share_expires_at: Date | null;
  share_revoked: boolean;
}

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const r = await queryOne<Row>(
    `SELECT id, client_id, data, analysis, share_token, share_expires_at, share_revoked
     FROM reports WHERE id = $1`,
    [id],
  );
  if (!r) notFound();

  const shareUrl = new URL(`/r/${r.share_token}`, env().APP_URL).toString();
  const expired = r.share_expires_at !== null && r.share_expires_at < new Date();
  const shareActive = !r.share_revoked && !expired;

  return (
    <div className="stack">
      <div className="no-print">
        <Link href={`/clients/${r.client_id}`} className="small">← Voltar ao cliente</Link>
      </div>

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

      {!r.analysis && (
        <p className="muted no-print">
          A análise em texto não foi gerada (chave da Claude ausente, sem dados ou falha temporária). Números e gráficos estão completos.
        </p>
      )}

      <ReportView data={r.data} analysis={r.analysis} />
    </div>
  );
}
