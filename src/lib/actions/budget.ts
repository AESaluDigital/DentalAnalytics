"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can, requireUser } from "../auth";
import { monthStart, saveBudgets } from "../budget";
import { queryOne } from "../db";

/** "5.000,50" / "5000.50" / "R$ 5.000" → 5000.5 ; vazio → null (remove o orçamento). */
function parseMoney(raw: FormDataEntryValue | null): number | null | "invalid" {
  const s = String(raw ?? "").replace(/[R$\s]/g, "").trim();
  if (!s) return null;
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/\.(?=\d{3}(\D|$))/g, "");
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0 || n > 1e10) return "invalid";
  return Math.round(n * 100) / 100;
}

/** Só aceita voltar para o dashboard (evita redirecionar para outro site). */
function safeBack(raw: FormDataEntryValue | null): string {
  const s = String(raw ?? "");
  return s.startsWith("/dashboard") && !s.startsWith("//") ? s : "/dashboard";
}

export async function saveBudgetAction(form: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user, "manage_clients") && !can(user, "manage_integrations")) redirect("/dashboard");
  const clientId = Number(form.get("clientId"));
  if (!Number.isInteger(clientId) || clientId <= 0) redirect("/dashboard");
  if (!(await queryOne("SELECT 1 FROM clients WHERE id = $1", [clientId]))) redirect("/dashboard");

  const back = safeBack(form.get("back"));
  const sep = back.includes("?") ? "&" : "?";
  const values: Record<string, number | null> = {};
  for (const key of ["meta", "google", "total"] as const) {
    if (!form.has(key)) continue;
    const v = parseMoney(form.get(key));
    if (v === "invalid") redirect(`${back}${sep}budget_error=${encodeURIComponent("Valor de orçamento inválido.")}#orcamento`);
    values[key] = v;
  }

  await saveBudgets(clientId, monthStart(), values, user.id);
  revalidatePath("/dashboard");
  redirect(`${back}${sep}budget_ok=1#orcamento`);
}
