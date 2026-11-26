"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "../auth";
import { ensureSchema, query, queryOne } from "../db";
import { env } from "../env";
import { daysBetween, isIsoDate, todayIso } from "../dates";
import { buildReportData } from "../report/build";
import { generateAnalysis } from "../report/analysis";
import { hasSellbot } from "../platforms/sellbot";
import { resolveLayout } from "../templates";
import type { ClientRow } from "../types";

export interface GenerateState {
  error?: string;
}

const MAX_DAYS = 366;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function reportId(form: FormData): string {
  const id = String(form.get("id") ?? "");
  if (!UUID.test(id)) redirect("/");
  return id;
}

function newShareToken(): string {
  return randomBytes(24).toString("base64url");
}

function shareExpiry(): Date | null {
  const days = env().SHARE_LINK_DAYS;
  return days > 0 ? new Date(Date.now() + days * 86_400_000) : null;
}

type Created = { ok: true; id: string } | { ok: false; error: string };

/** Modelo escolhido na geração: "client" = padrão do cliente; número = modelo; null = relatório completo. */
export type TemplateChoice = number | "client" | null;

function parseChoice(v: unknown): TemplateChoice {
  if (v === "none" || v === null) return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : "client";
}

/** Valida, consulta as plataformas, gera a análise (opcional) e salva o relatório. */
async function createReport(
  userId: number,
  clientId: number,
  start: string,
  end: string,
  withAnalysis: boolean,
  choice: TemplateChoice = "client",
): Promise<Created> {
  if (!Number.isInteger(clientId)) return { ok: false, error: "Cliente inválido." };
  if (!isIsoDate(start) || !isIsoDate(end)) return { ok: false, error: "Datas inválidas." };
  if (end < start) return { ok: false, error: "A data final deve ser igual ou posterior à inicial." };
  if (end > todayIso()) return { ok: false, error: "A data final não pode estar no futuro." };
  if (daysBetween({ start, end }) > MAX_DAYS) return { ok: false, error: `Período máximo: ${MAX_DAYS} dias.` };

  const client = await queryOne<ClientRow>(
    `SELECT id, name, meta_ad_account_id, meta_conversion_action, google_ads_customer_id, ga4_property_id, active
     FROM clients WHERE id = $1`,
    [clientId],
  );
  if (!client) return { ok: false, error: "Cliente não encontrado." };
  if (!client.meta_ad_account_id && !client.google_ads_customer_id && !client.ga4_property_id && !(await hasSellbot(client.id))) {
    return { ok: false, error: "Sem nenhuma conta vinculada." };
  }

  await ensureSchema();
  const template = await resolveLayout(choice, client.id);
  if (typeof choice === "number" && !template) return { ok: false, error: "Modelo não encontrado." };
  const data = await buildReportData(client, { start, end });
  // Modelo sem o resumo executivo: não gasta tempo com a IA.
  const analysis = withAnalysis && template?.layout.sections.analysis !== false ? await generateAnalysis(data) : null;

  const row = await queryOne<{ id: string }>(
    `INSERT INTO reports (client_id, period_start, period_end, data, analysis, share_token, share_expires_at, created_by, template)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [client.id, start, end, JSON.stringify(data), analysis ? JSON.stringify(analysis) : null, newShareToken(), shareExpiry(), userId,
     template ? JSON.stringify({ id: template.id, name: template.name, ...template.layout }) : null],
  );
  revalidatePath(`/clients/${client.id}`);
  revalidatePath("/reports");
  return { ok: true, id: row!.id };
}

export async function generateReportAction(_prev: GenerateState, form: FormData): Promise<GenerateState> {
  const user = await requirePermission("export_reports");
  const res = await createReport(
    user.id,
    Number(form.get("clientId")),
    String(form.get("start") ?? ""),
    String(form.get("end") ?? ""),
    true,
    parseChoice(form.get("template")),
  );
  if (!res.ok) return { error: res.error };
  redirect(`/reports/${res.id}`);
}

/**
 * Geração em massa: a tela Relatórios chama esta ação uma vez por cliente (poucas em paralelo),
 * assim cada chamada fica dentro do limite de tempo da hospedagem.
 */
export async function generateOneReportAction(
  clientId: number,
  start: string,
  end: string,
  withAnalysis: boolean,
  template: number | "client" | "none" = "client",
): Promise<Created> {
  const user = await requirePermission("export_reports");
  try {
    return await createReport(user.id, clientId, start, end, withAnalysis, parseChoice(template));
  } catch (err) {
    console.error("[reports] falha na geração em massa", err);
    return { ok: false, error: "Falha inesperada ao gerar." };
  }
}

export async function rotateShareAction(form: FormData): Promise<void> {
  await requirePermission("export_reports");
  const id = reportId(form);
  await query(
    "UPDATE reports SET share_token = $1, share_expires_at = $2, share_revoked = FALSE WHERE id = $3",
    [newShareToken(), shareExpiry(), id],
  );
  revalidatePath(`/reports/${id}`);
}

export async function revokeShareAction(form: FormData): Promise<void> {
  await requirePermission("export_reports");
  const id = reportId(form);
  await query("UPDATE reports SET share_revoked = TRUE WHERE id = $1", [id]);
  revalidatePath(`/reports/${id}`);
}

export async function deleteReportAction(form: FormData): Promise<void> {
  await requirePermission("export_reports");
  const id = reportId(form);
  const row = await queryOne<{ client_id: number }>("DELETE FROM reports WHERE id = $1 RETURNING client_id", [id]);
  if (row) {
    revalidatePath(`/clients/${row.client_id}`);
    redirect(`/clients/${row.client_id}`);
  }
  redirect("/");
}
