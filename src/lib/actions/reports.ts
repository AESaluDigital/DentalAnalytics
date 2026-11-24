"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "../auth";
import { query, queryOne } from "../db";
import { env } from "../env";
import { daysBetween, isIsoDate, todayIso } from "../dates";
import { buildReportData } from "../report/build";
import { generateAnalysis } from "../report/analysis";
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

export async function generateReportAction(_prev: GenerateState, form: FormData): Promise<GenerateState> {
  const user = await requirePermission("export_reports");

  const clientId = Number(form.get("clientId"));
  const start = String(form.get("start") ?? "");
  const end = String(form.get("end") ?? "");

  if (!Number.isInteger(clientId)) return { error: "Cliente inválido." };
  if (!isIsoDate(start) || !isIsoDate(end)) return { error: "Datas inválidas." };
  if (end < start) return { error: "A data final deve ser igual ou posterior à inicial." };
  if (end > todayIso()) return { error: "A data final não pode estar no futuro." };
  if (daysBetween({ start, end }) > MAX_DAYS) return { error: `Período máximo: ${MAX_DAYS} dias.` };

  const client = await queryOne<ClientRow>(
    `SELECT id, name, meta_ad_account_id, meta_conversion_action, google_ads_customer_id, ga4_property_id, active
     FROM clients WHERE id = $1`,
    [clientId],
  );
  if (!client) return { error: "Cliente não encontrado." };
  if (!client.meta_ad_account_id && !client.google_ads_customer_id && !client.ga4_property_id) {
    return { error: "Este cliente não tem nenhuma conta vinculada." };
  }

  const data = await buildReportData(client, { start, end });
  const analysis = await generateAnalysis(data);

  const row = await queryOne<{ id: string }>(
    `INSERT INTO reports (client_id, period_start, period_end, data, analysis, share_token, share_expires_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [client.id, start, end, JSON.stringify(data), analysis ? JSON.stringify(analysis) : null, newShareToken(), shareExpiry(), user.id],
  );

  revalidatePath(`/clients/${client.id}`);
  redirect(`/reports/${row!.id}`);
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
