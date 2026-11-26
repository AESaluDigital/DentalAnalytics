import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { DEFAULT_LAYOUT } from "@/lib/report-template";
import TemplateEditor from "@/components/TemplateEditor";

export const metadata = { title: "Novo modelo de relatório" };

export default async function NewTemplatePage() {
  await requirePermission("export_reports");
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <Link href="/reports/templates" className="small back-link">← Modelos de relatório</Link>
          <h1>Novo modelo</h1>
        </div>
      </div>
      <TemplateEditor id={null} initialName="" initial={DEFAULT_LAYOUT} />
    </div>
  );
}
