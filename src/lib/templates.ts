import "server-only";
import { ensureSchema, query, queryOne } from "./db";
import { sanitizeLayout, type ReportLayout } from "./report-template";

/** Modelos de relatório salvos e o modelo padrão de cada cliente. */

export interface TemplateRow {
  id: number;
  name: string;
  layout: ReportLayout;
  author: string | null;
  updatedAt: string;
  /** Clientes que usam este modelo como padrão. */
  clientIds: number[];
}

export async function listTemplates(): Promise<TemplateRow[]> {
  await ensureSchema();
  const rows = await query<{ id: number; name: string; layout: unknown; author: string | null; updated_at: Date; client_ids: number[] | null }>(
    `SELECT t.id, t.name, t.layout, u.name AS author, t.updated_at,
            (SELECT array_agg(c.id ORDER BY c.id) FROM clients c WHERE c.report_template_id = t.id) AS client_ids
     FROM report_templates t LEFT JOIN users u ON u.id = t.created_by
     ORDER BY lower(t.name)`,
  );
  return rows.flatMap((r) => {
    const layout = sanitizeLayout(r.layout);
    return layout
      ? [{ id: r.id, name: r.name, layout, author: r.author, updatedAt: new Date(r.updated_at).toISOString(), clientIds: r.client_ids ?? [] }]
      : [];
  });
}

export async function getTemplate(id: number): Promise<TemplateRow | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  return (await listTemplates()).find((t) => t.id === id) ?? null;
}

/** Modelo a usar na geração: "client" = padrão do cliente; número = modelo escolhido; null = relatório completo. */
export async function resolveLayout(choice: number | "client" | null, clientId: number): Promise<{ id: number; name: string; layout: ReportLayout } | null> {
  if (choice === null) return null;
  await ensureSchema();
  const row = await queryOne<{ id: number; name: string; layout: unknown }>(
    choice === "client"
      ? "SELECT t.id, t.name, t.layout FROM clients c JOIN report_templates t ON t.id = c.report_template_id WHERE c.id = $1"
      : "SELECT id, name, layout FROM report_templates WHERE id = $1",
    [choice === "client" ? clientId : choice],
  );
  const layout = row && sanitizeLayout(row.layout);
  return row && layout ? { id: row.id, name: row.name, layout } : null;
}

export async function saveTemplate(id: number | null, name: string, layout: ReportLayout, userId: number): Promise<number | null> {
  await ensureSchema();
  const row = id
    ? await queryOne<{ id: number }>(
        "UPDATE report_templates SET name = $2, layout = $3, updated_at = now() WHERE id = $1 RETURNING id",
        [id, name, JSON.stringify(layout)],
      )
    : await queryOne<{ id: number }>(
        "INSERT INTO report_templates (name, layout, created_by) VALUES ($1, $2, $3) RETURNING id",
        [name, JSON.stringify(layout), userId],
      );
  return row?.id ?? null;
}

export async function deleteTemplate(id: number): Promise<boolean> {
  await ensureSchema();
  return (await query("DELETE FROM report_templates WHERE id = $1 RETURNING id", [id])).length > 0;
}

/**
 * Define o modelo padrão dos clientes: "all" = todos os clientes ativos; lista = só esses.
 * templateId null tira o modelo (volta ao relatório completo). Devolve quantos clientes mudaram.
 */
export async function applyTemplate(templateId: number | null, target: "all" | number[]): Promise<number> {
  await ensureSchema();
  const rows = target === "all"
    ? await query("UPDATE clients SET report_template_id = $1 WHERE active RETURNING id", [templateId])
    : await query("UPDATE clients SET report_template_id = $1 WHERE id = ANY($2::int[]) RETURNING id", [templateId, target]);
  return rows.length;
}

/** Tira o modelo dos clientes que o usam (sem afetar os demais). */
export async function unassignTemplate(templateId: number, clientIds: number[]): Promise<number> {
  await ensureSchema();
  const rows = await query(
    "UPDATE clients SET report_template_id = NULL WHERE report_template_id = $1 AND id = ANY($2::int[]) RETURNING id",
    [templateId, clientIds],
  );
  return rows.length;
}
