import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { query } from "@/lib/db";
import { getTemplate } from "@/lib/templates";
import TemplateEditor from "@/components/TemplateEditor";
import TemplateApply from "@/components/TemplateApply";

export const dynamic = "force-dynamic";
export const metadata = { title: "Modelo de relatório" };

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("export_reports");
  const t = await getTemplate(Number((await params).id));
  if (!t) notFound();

  const clients = await query<{ id: number; name: string; tpl_id: number | null; tpl_name: string | null }>(
    `SELECT c.id, c.name, t.id AS tpl_id, t.name AS tpl_name
     FROM clients c LEFT JOIN report_templates t ON t.id = c.report_template_id
     WHERE c.active ORDER BY lower(c.name)`,
  );

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <Link href="/reports/templates" className="small back-link">← Modelos de relatório</Link>
          <h1>{t.name}</h1>
        </div>
      </div>
      <TemplateEditor key={t.updatedAt} id={t.id} initialName={t.name} initial={t.layout} />
      <TemplateApply templateId={t.id} templateName={t.name}
        clients={clients.map((c) => ({ id: c.id, name: c.name, current: c.tpl_id ? { id: c.tpl_id, name: c.tpl_name ?? "" } : null }))} />
    </div>
  );
}
