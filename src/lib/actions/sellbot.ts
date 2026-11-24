"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can, requireUser } from "../auth";
import { queryOne } from "../db";
import { PlatformError } from "../platforms/http";
import {
  deleteSellbotConnection,
  saveSellbotConnection,
  sellbotPipelines,
  setSellbotGlobalPipelines,
} from "../platforms/sellbot";
import { clearLiveCache } from "../report/live";

function clientId(form: FormData): number {
  const id = Number(form.get("clientId"));
  if (!Number.isInteger(id) || id <= 0) redirect("/");
  return id;
}

const LIST = "/settings/sellbot";

/** Quem cadastra clientes ou cuida das integrações pode conectar a Sellbot. */
async function requireSellbotAdmin() {
  const user = await requireUser();
  if (!can(user, "manage_clients") && !can(user, "manage_integrations")) redirect("/");
  return user;
}

/** Volta para a tela de onde veio: lista "Contas Sellbot" ou Editar cliente. */
function back(form: FormData, id: number, kind: "sellbot_ok" | "sellbot_error", text: string): never {
  clearLiveCache(id);
  revalidatePath(`/clients/${id}`);
  revalidatePath(`/clients/${id}/edit`);
  revalidatePath(LIST);
  if (form.get("back") === LIST) redirect(`${LIST}?${kind}=${encodeURIComponent(text)}&c=${id}#c${id}`);
  redirect(`/clients/${id}/edit?${kind}=${encodeURIComponent(text)}#sellbot`);
}

/** Salva o token da Sellbot do cliente depois de testar a conexão (lista os funis). */
export async function connectSellbotAction(form: FormData): Promise<void> {
  const user = await requireSellbotAdmin();
  const id = clientId(form);
  const token = String(form.get("token") ?? "").trim();
  if (!(await queryOne("SELECT 1 FROM clients WHERE id = $1", [id]))) redirect("/");
  if (!/^sbt_[A-Za-z0-9_-]{16,200}$/.test(token)) back(form, id, "sellbot_error", "Token inválido: ele começa com sbt_ (gere em Sellbot → Configurações → API Tokens).");

  let pipelines: { id: string; name: string }[];
  try {
    pipelines = await sellbotPipelines(token);
  } catch (err) {
    const msg = err instanceof PlatformError ? err.message : "Falha ao contatar a Sellbot.";
    back(form, id, "sellbot_error", `A Sellbot recusou o token: ${msg}`);
  }
  try {
    await saveSellbotConnection(id, token, user.id);
  } catch (err) {
    console.error("[sellbot] falha ao salvar conexão", err);
    back(form, id, "sellbot_error", "Não foi possível salvar o token (verifique a INTEGRATIONS_KEY do servidor).");
  }
  back(form, id, "sellbot_ok", `Sellbot conectada: ${pipelines.length} funil(is) encontrado(s).`);
}

/** Funis que entram na visão Global (os demais continuam visíveis individualmente). */
export async function saveSellbotPipelinesAction(form: FormData): Promise<void> {
  await requireSellbotAdmin();
  const id = clientId(form);
  const all = form.getAll("all").map(String);
  const picked = form.getAll("pipe").map(String).filter((p) => all.includes(p));
  await setSellbotGlobalPipelines(id, picked.length === all.length ? null : picked);
  back(form, id, "sellbot_ok", "Funis da visão Global salvos.");
}

export async function disconnectSellbotAction(form: FormData): Promise<void> {
  await requireSellbotAdmin();
  const id = clientId(form);
  await deleteSellbotConnection(id);
  back(form, id, "sellbot_ok", "Sellbot desconectada deste cliente.");
}
