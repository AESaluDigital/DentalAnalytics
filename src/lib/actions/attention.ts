"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission, requireUser } from "../auth";
import { queryOne } from "../db";
import { addComment, addReply, markAllRead, setStatus, type CommentStatus } from "../attention";

/** Só volta para a Visão geral (evita redirecionar para outro site). */
function back(form: FormData, hash = ""): string {
  const s = String(form.get("back") ?? "");
  const base = s.startsWith("/overview") && !s.startsWith("//") ? s : "/overview";
  return `${base.split("#")[0]}${hash}`;
}

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim().slice(0, 2000);
const id = (form: FormData, key: string) => {
  const n = Number(form.get(key));
  return Number.isInteger(n) && n > 0 ? n : null;
};

export async function addCommentAction(form: FormData): Promise<void> {
  const user = await requirePermission("view_overview");
  const clientId = id(form, "clientId");
  const body = text(form, "body");
  if (!clientId || !body) redirect(back(form));
  if (!(await queryOne("SELECT 1 FROM clients WHERE id = $1", [clientId]))) redirect(back(form));
  await addComment(clientId, user.id, body);
  revalidatePath("/overview");
  redirect(back(form, `#atencao-${clientId}`));
}

export async function replyAction(form: FormData): Promise<void> {
  const user = await requirePermission("view_overview");
  const commentId = id(form, "commentId");
  const body = text(form, "body");
  if (commentId && body) await addReply(commentId, user.id, body);
  revalidatePath("/overview");
  redirect(back(form, commentId ? `#comentario-${commentId}` : ""));
}

export async function setStatusAction(form: FormData): Promise<void> {
  const user = await requirePermission("view_overview");
  const commentId = id(form, "commentId");
  const raw = String(form.get("status") ?? "");
  const status: CommentStatus | null = raw === "open" || raw === "resolved" || raw === "dismissed" ? raw : null;
  if (commentId && status) await setStatus(commentId, user.id, status);
  revalidatePath("/overview");
  redirect(back(form, commentId ? `#comentario-${commentId}` : ""));
}

export async function markNotificationsReadAction(): Promise<void> {
  const user = await requireUser();
  await markAllRead(user.id);
  revalidatePath("/notifications");
  redirect("/notifications");
}
