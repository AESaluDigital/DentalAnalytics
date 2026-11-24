"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "../auth";
import { applyImport, planImport } from "../import-plan";
import { PlatformError } from "../platforms/http";
import { clearDiscoveryCache } from "../platforms/discovery";
import { readSheetClients } from "../sheet-import";

const PAGE = "/clients/import";

/** Importa (cria/atualiza) os clientes da planilha. Refaz a leitura e o plano no servidor (não confia na prévia). */
export async function importSheetAction(form: FormData): Promise<void> {
  const user = await requirePermission("manage_clients");
  const url = String(form.get("url") ?? "").slice(0, 500);
  const tab = String(form.get("tab") ?? "Google Ads").slice(0, 100);
  const status = String(form.get("status") ?? "ATIVO").slice(0, 50);
  const back = new URLSearchParams({ url, tab, status });

  let msg: string;
  try {
    const plan = await planImport(await readSheetClients(url, tab, status));
    const r = await applyImport(plan, user.id);
    msg = `Importação concluída: ${r.created} cliente(s) criado(s), ${r.updated} atualizado(s), ${r.budgets} orçamento(s) do mês gravado(s), ${r.skipped} sem alteração.`;
  } catch (err) {
    back.set("error", err instanceof PlatformError ? err.message : "Falha inesperada ao importar.");
    redirect(`${PAGE}?${back}`);
  }
  clearDiscoveryCache();
  revalidatePath("/");
  revalidatePath("/dashboard");
  back.set("ok", msg);
  redirect(`${PAGE}?${back}`);
}
