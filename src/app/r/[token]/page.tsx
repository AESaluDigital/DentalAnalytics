import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { queryOne } from "@/lib/db";
import ReportView from "@/components/report/ReportView";
import PrintButton from "@/components/PrintButton";
import Logo from "@/components/Logo";
import type { ReportAnalysis, ReportData } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Relatório de desempenho",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

const TOKEN = /^[A-Za-z0-9_-]{32}$/;

/** Página pública (sem login), acessível apenas com o token do link. */
export default async function PublicReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN.test(token)) notFound();

  const r = await queryOne<{ data: ReportData; analysis: ReportAnalysis | null }>(
    `SELECT data, analysis FROM reports
     WHERE share_token = $1 AND share_revoked = FALSE
       AND (share_expires_at IS NULL OR share_expires_at > now())`,
    [token],
  );
  if (!r) notFound();

  return (
    <main className="public-shell stack">
      <div className="row no-print" style={{ justifyContent: "flex-end" }}>
        <PrintButton />
      </div>
      <ReportView data={r.data} analysis={r.analysis} />
      <footer className="public-footer">
        <span>Relatório gerado pela</span>
        <Logo height={18} />
      </footer>
    </main>
  );
}
