"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "../auth";
import { sanitizeLayout } from "../report-template";
import { applyTemplate, deleteTemplate, saveTemplate, unassignTemplate } from "../templates";

/** Ações dos modelos de relatório (quem gera relatórios também cria e aplica modelos). */

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const validId = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0;

export async function saveTemplateAction(id: number | null, name: string, layout: unknown): Promise<Result<{ id: number }>> {
  const user = await requirePermission("export_reports");
  const title = String(name ?? "").trim().slice(0, 120);
  if (!title) return { ok: false, error: "Dê um nome ao modelo." };
  if (id !== null && !validId(id)) return { ok: false, error: "Modelo inválido." };
  const clean = sanitizeLayout(layout);
  if (!clean) return { ok: false, error: "Modelo inválido." };
  if (!clean.cards.length && !Object.values(clean.sections).some(Boolean)) {
    return { ok: false, error: "Adicione pelo menos um card com métricas ou marque uma seção." };
  }
  const saved = await saveTemplate(id, title, clean, user.id);
  if (!saved) return { ok: false, error: "Modelo não encontrado." };
  revalidatePath("/reports/templates");
  return { ok: true, data: { id: saved } };
}

export async function deleteTemplateAction(id: number): Promise<Result<null>> {
  await requirePermission("export_reports");
  if (!validId(id)) return { ok: false, error: "Modelo inválido." };
  const ok = await deleteTemplate(id);
  revalidatePath("/reports/templates");
  return ok ? { ok: true, data: null } : { ok: false, error: "Modelo não encontrado." };
}

/** Define o modelo como padrão de todos os clientes ou dos clientes escolhidos. */
export async function applyTemplateAction(templateId: number, target: "all" | number[]): Promise<Result<{ count: number }>> {
  await requirePermission("export_reports");
  if (!validId(templateId)) return { ok: false, error: "Modelo inválido." };
  if (target !== "all" && (!Array.isArray(target) || !target.length || !target.every(validId))) {
    return { ok: false, error: "Escolha pelo menos um cliente." };
  }
  const count = await applyTemplate(templateId, target);
  revalidatePath("/reports/templates");
  return { ok: true, data: { count } };
}

export async function unassignTemplateAction(templateId: number, clientIds: number[]): Promise<Result<{ count: number }>> {
  await requirePermission("export_reports");
  if (!validId(templateId) || !Array.isArray(clientIds) || !clientIds.every(validId)) return { ok: false, error: "Ação inválida." };
  const count = await unassignTemplate(templateId, clientIds);
  revalidatePath("/reports/templates");
  return { ok: true, data: { count } };
}
