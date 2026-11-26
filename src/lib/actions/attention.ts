"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission, requireUser } from "../auth";
import { queryOne } from "../db";
import {
  addComment, addReply, deleteComment, markAllRead, setStatus,
  type CommentDTO, type CommentStatus, type ReplyDTO,
} from "../attention";

/**
 * Ações dos comentários de pontos de atenção. Devolvem o resultado para a tela se atualizar na hora,
 * sem recarregar a Visão geral (que consulta Meta/Google de todos os clientes).
 */

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const clean = (v: unknown) => String(v ?? "").trim().slice(0, 2000);
const validId = (v: unknown) => Number.isInteger(v) && (v as number) > 0;

export async function addCommentAction(clientId: number, body: string): Promise<Result<CommentDTO>> {
  const user = await requirePermission("view_overview");
  const text = clean(body);
  if (!validId(clientId) || !text) return { ok: false, error: "Escreva o comentário." };
  if (!(await queryOne("SELECT 1 FROM clients WHERE id = $1", [clientId]))) return { ok: false, error: "Cliente não encontrado." };
  return { ok: true, data: await addComment(clientId, user.id, text) };
}

export async function replyAction(commentId: number, body: string): Promise<Result<ReplyDTO>> {
  const user = await requirePermission("view_overview");
  const text = clean(body);
  if (!validId(commentId) || !text) return { ok: false, error: "Escreva a resposta." };
  const reply = await addReply(commentId, user.id, text);
  return reply ? { ok: true, data: reply } : { ok: false, error: "Comentário não encontrado." };
}

export async function setStatusAction(commentId: number, status: CommentStatus): Promise<Result<CommentDTO>> {
  const user = await requirePermission("view_overview");
  if (!validId(commentId) || !["open", "resolved", "dismissed"].includes(status)) return { ok: false, error: "Ação inválida." };
  const c = await setStatus(commentId, user.id, status);
  return c ? { ok: true, data: c } : { ok: false, error: "Comentário não encontrado." };
}

/** Só o autor do comentário (ou uma conta master) pode excluir. */
export async function deleteCommentAction(commentId: number): Promise<Result<null>> {
  const user = await requirePermission("view_overview");
  if (!validId(commentId)) return { ok: false, error: "Ação inválida." };
  const ok = await deleteComment(commentId, user.id, user.master);
  return ok ? { ok: true, data: null } : { ok: false, error: "Só quem escreveu pode excluir o comentário." };
}

export async function markNotificationsReadAction(): Promise<void> {
  const user = await requireUser();
  await markAllRead(user.id);
  revalidatePath("/notifications");
  redirect("/notifications");
}
