"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "../auth";
import { deleteIntegration } from "../integrations";
import { revokeGoogle, revokeMeta } from "../oauth";
import { clearDiscoveryCache } from "../platforms/discovery";
import { clearGoogleTokenCache } from "../platforms/google-oauth";

/** Desconecta: apaga o token do banco e revoga o acesso na própria plataforma. */
export async function disconnectAction(form: FormData): Promise<void> {
  await requireAdmin();
  const provider = String(form.get("provider"));
  if (provider !== "meta" && provider !== "google") return;

  const token = await deleteIntegration(provider);
  if (token) {
    if (provider === "meta") await revokeMeta(token);
    else await revokeGoogle(token);
  }
  clearDiscoveryCache();
  clearGoogleTokenCache();
  revalidatePath("/settings/integrations");
}

/** Recarrega a lista de contas disponíveis (ignora o cache de 10 min). */
export async function refreshAccountsAction(): Promise<void> {
  await requireAdmin();
  clearDiscoveryCache();
  revalidatePath("/settings/integrations");
}
