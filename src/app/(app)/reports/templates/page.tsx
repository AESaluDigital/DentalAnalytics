import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { query } from "@/lib/db";
import { listTemplates } from "@/lib/templates";
import { SECTIONS, metricDef } from "@/lib/report-template";

export const dynamic = "force-dynamic";
export const metadata = { title: "Modelos de relatório" };

export default async function TemplatesPage() {
  await requirePermission("export_reports");
  const [templates, [{ n: activeClients }]] = await Promise.all([
    listTemplates(),
    query<{ n: number }>("SELECT count(*)::int AS n FROM clients WHERE active"),
  ]);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <Link href="/reports" className="small back-link">← Relatórios</Link>
          <h1>Modelos de relatório</h1>
          <p className="muted small" style={{ margin: 0 }}>
            Escolha quantos cards o relatório tem, quais métricas aparecem em cada um e quais seções vão para o cliente.
          </p>
        </div>
        <Link className="btn primary" href="/reports/templates/new">+ Novo modelo</Link>
      </div>

      {templates.length === 0 ? (
        <div className="card stack">
          <p style={{ margin: 0 }}>Nenhum modelo ainda. Sem modelo, os relatórios saem completos (todas as seções).</p>
          <div className="row"><Link className="btn primary" href="/reports/templates/new">Criar o primeiro modelo</Link></div>
        </div>
      ) : (
        <div className="tpl-list">
          {templates.map((t) => {
            const metrics = t.layout.cards.reduce((a, c) => a + c.metrics.length, 0);
            const off = SECTIONS.filter((s) => !t.layout.sections[s.key]).length;
            const n = t.clientIds.length;
            return (
              <Link key={t.id} href={`/reports/templates/${t.id}`} className="card tpl-item">
                <div className="row between">
                  <strong>{t.name}</strong>
                  <span className={`badge${n ? " status-ok" : ""}`}>
                    {n === 0 ? "nenhum cliente" : n >= activeClients ? "todos os clientes" : `${n} cliente${n === 1 ? "" : "s"}`}
                  </span>
                </div>
                <span className="muted small">
                  {t.layout.cards.length} card{t.layout.cards.length === 1 ? "" : "s"} · {metrics} métrica{metrics === 1 ? "" : "s"} ·{" "}
                  {SECTIONS.length - off} de {SECTIONS.length} seções
                </span>
                <div className="tpl-preview">
                  {t.layout.cards.slice(0, 4).map((c, i) => (
                    <span key={i} className="tpl-preview-card">
                      <b>{c.title}</b>
                      {c.metrics.slice(0, 4).map((m) => metricDef(m)?.fullLabel).join(" · ")}
                      {c.metrics.length > 4 ? ` +${c.metrics.length - 4}` : ""}
                    </span>
                  ))}
                  {t.layout.cards.length > 4 && <span className="muted small">+{t.layout.cards.length - 4} cards</span>}
                </div>
                <span className="muted small">{t.author ? `Criado por ${t.author} · ` : ""}atualizado em {new Date(t.updatedAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
