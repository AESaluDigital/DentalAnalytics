import "server-only";
import { ensureSchema, query } from "./db";

/** Comentários de pontos de atenção (Visão geral), respostas e notificações para quem participa. */

export type CommentStatus = "open" | "resolved" | "dismissed";

export interface AttentionReply {
  id: number;
  author: string | null;
  authorId: number | null;
  body: string;
  createdAt: Date;
}

export interface AttentionComment {
  id: number;
  clientId: number;
  author: string | null;
  authorId: number | null;
  body: string;
  status: CommentStatus;
  closedBy: string | null;
  closedAt: Date | null;
  createdAt: Date;
  replies: AttentionReply[];
}

/** Comentários em aberto de todos os clientes + os fechados nos últimos 30 dias (histórico curto). */
export async function listComments(): Promise<AttentionComment[]> {
  await ensureSchema();
  const comments = await query<{
    id: number; client_id: number; author: string | null; author_id: number | null; body: string; status: CommentStatus;
    closed_by: string | null; closed_at: Date | null; created_at: Date;
  }>(
    `SELECT c.id, c.client_id, u.name AS author, c.author_id, c.body, c.status, cu.name AS closed_by, c.closed_at, c.created_at
     FROM attention_comments c
     LEFT JOIN users u ON u.id = c.author_id
     LEFT JOIN users cu ON cu.id = c.closed_by
     WHERE c.status = 'open' OR c.closed_at > now() - interval '30 days'
     ORDER BY c.created_at DESC
     LIMIT 500`,
  );
  if (!comments.length) return [];
  const replies = await query<{ id: number; comment_id: number; author: string | null; author_id: number | null; body: string; created_at: Date }>(
    `SELECT r.id, r.comment_id, u.name AS author, r.author_id, r.body, r.created_at
     FROM attention_replies r LEFT JOIN users u ON u.id = r.author_id
     WHERE r.comment_id = ANY($1::int[]) ORDER BY r.created_at`,
    [comments.map((c) => c.id)],
  );
  return comments.map((c) => ({
    id: c.id,
    clientId: c.client_id,
    author: c.author,
    authorId: c.author_id,
    body: c.body,
    status: c.status,
    closedBy: c.closed_by,
    closedAt: c.closed_at,
    createdAt: c.created_at,
    replies: replies
      .filter((r) => r.comment_id === c.id)
      .map((r) => ({ id: r.id, author: r.author, authorId: r.author_id, body: r.body, createdAt: r.created_at })),
  }));
}

export async function addComment(clientId: number, authorId: number, body: string): Promise<void> {
  await ensureSchema();
  await query("INSERT INTO attention_comments (client_id, author_id, body) VALUES ($1, $2, $3)", [clientId, authorId, body]);
}

/** Avisa quem participa do comentário (autor e quem respondeu), menos quem fez a ação. */
async function notify(commentId: number, actorId: number, kind: "reply" | "resolved" | "dismissed" | "reopened"): Promise<void> {
  await query(
    `INSERT INTO notifications (user_id, comment_id, kind, actor_id)
     SELECT DISTINCT p.uid, $1::int, $2::text, $3::int FROM (
       SELECT author_id AS uid FROM attention_comments WHERE id = $1
       UNION SELECT author_id FROM attention_replies WHERE comment_id = $1
     ) p
     JOIN users u ON u.id = p.uid AND u.active
     WHERE p.uid IS NOT NULL AND p.uid <> $3`,
    [commentId, kind, actorId],
  );
}

export async function addReply(commentId: number, authorId: number, body: string): Promise<boolean> {
  await ensureSchema();
  const ok = await query("SELECT 1 FROM attention_comments WHERE id = $1", [commentId]);
  if (!ok.length) return false;
  await query("INSERT INTO attention_replies (comment_id, author_id, body) VALUES ($1, $2, $3)", [commentId, authorId, body]);
  await notify(commentId, authorId, "reply");
  return true;
}

export async function setStatus(commentId: number, actorId: number, status: CommentStatus): Promise<boolean> {
  await ensureSchema();
  const rows = await query<{ id: number }>(
    `UPDATE attention_comments SET status = $2,
       closed_by = CASE WHEN $2 = 'open' THEN NULL ELSE $3::int END,
       closed_at = CASE WHEN $2 = 'open' THEN NULL ELSE now() END
     WHERE id = $1 AND status <> $2 RETURNING id`,
    [commentId, status, actorId],
  );
  if (!rows.length) return false;
  await notify(commentId, actorId, status === "open" ? "reopened" : status);
  return true;
}

/* ---------- Notificações ---------- */

export interface NotificationRow {
  id: number;
  kind: "reply" | "resolved" | "dismissed" | "reopened";
  actor: string | null;
  clientId: number | null;
  clientName: string | null;
  commentBody: string | null;
  read: boolean;
  createdAt: Date;
}

export async function unreadCount(userId: number): Promise<number> {
  await ensureSchema();
  const [r] = await query<{ n: string }>("SELECT count(*) AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL", [userId]);
  return Number(r?.n ?? 0);
}

export async function listNotifications(userId: number): Promise<NotificationRow[]> {
  await ensureSchema();
  const rows = await query<{
    id: number; kind: NotificationRow["kind"]; actor: string | null; client_id: number | null; client_name: string | null;
    body: string | null; read_at: Date | null; created_at: Date;
  }>(
    `SELECT n.id, n.kind, a.name AS actor, c.client_id, cl.name AS client_name, c.body, n.read_at, n.created_at
     FROM notifications n
     LEFT JOIN users a ON a.id = n.actor_id
     LEFT JOIN attention_comments c ON c.id = n.comment_id
     LEFT JOIN clients cl ON cl.id = c.client_id
     WHERE n.user_id = $1 ORDER BY n.created_at DESC LIMIT 100`,
    [userId],
  );
  return rows.map((r) => ({
    id: r.id, kind: r.kind, actor: r.actor, clientId: r.client_id, clientName: r.client_name,
    commentBody: r.body, read: r.read_at !== null, createdAt: r.created_at,
  }));
}

export async function markAllRead(userId: number): Promise<void> {
  await ensureSchema();
  await query("UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL", [userId]);
}
