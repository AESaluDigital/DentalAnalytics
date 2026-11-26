import "server-only";
import { ensureSchema, query, queryOne } from "./db";

/** Comentários de pontos de atenção (Visão geral), respostas e notificações para quem participa. */

export type CommentStatus = "open" | "resolved" | "dismissed";

/** Formatos enviados para a tela (datas em ISO). */
export interface ReplyDTO {
  id: number;
  author: string | null;
  authorId: number | null;
  body: string;
  createdAt: string;
}

export interface CommentDTO {
  id: number;
  clientId: number;
  author: string | null;
  authorId: number | null;
  body: string;
  status: CommentStatus;
  closedBy: string | null;
  closedAt: string | null;
  createdAt: string;
  replies: ReplyDTO[];
}

/** Janela em que um comentário idêntico do mesmo autor no mesmo cliente é tratado como clique repetido. */
const DUPLICATE_WINDOW = "2 minutes";

const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);

interface CommentRow {
  id: number; client_id: number; author: string | null; author_id: number | null; body: string; status: CommentStatus;
  closed_by: string | null; closed_at: Date | null; created_at: Date;
}

const COMMENT_SELECT = `SELECT c.id, c.client_id, u.name AS author, c.author_id, c.body, c.status, cu.name AS closed_by, c.closed_at, c.created_at
  FROM attention_comments c
  LEFT JOIN users u ON u.id = c.author_id
  LEFT JOIN users cu ON cu.id = c.closed_by`;

const toDTO = (c: CommentRow, replies: ReplyDTO[] = []): CommentDTO => ({
  id: c.id,
  clientId: c.client_id,
  author: c.author,
  authorId: c.author_id,
  body: c.body,
  status: c.status,
  closedBy: c.closed_by,
  closedAt: iso(c.closed_at),
  createdAt: iso(c.created_at)!,
  replies,
});

/**
 * Remove comentários repetidos por clique duplo: mesmo autor, cliente e texto, criados até 2 minutos depois
 * de um igual, sem respostas. Roda uma vez por processo (limpa também os que entraram antes da trava).
 */
let deduped: Promise<void> | undefined;
function dedupe(): Promise<void> {
  deduped ??= query(
    `DELETE FROM attention_comments d
     USING attention_comments o
     WHERE d.client_id = o.client_id AND d.author_id IS NOT DISTINCT FROM o.author_id AND d.body = o.body
       AND d.id > o.id AND d.created_at - o.created_at <= interval '${DUPLICATE_WINDOW}'
       AND NOT EXISTS (SELECT 1 FROM attention_replies r WHERE r.comment_id = d.id)`,
  ).then(() => undefined, (err) => {
    console.error("[attention] falha ao remover duplicados", err);
    deduped = undefined;
  });
  return deduped;
}

/** Comentários em aberto de todos os clientes + os fechados nos últimos 30 dias (histórico curto). */
export async function listComments(): Promise<CommentDTO[]> {
  await ensureSchema();
  await dedupe();
  const comments = await query<CommentRow>(
    `${COMMENT_SELECT}
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
  return comments.map((c) =>
    toDTO(c, replies
      .filter((r) => r.comment_id === c.id)
      .map((r) => ({ id: r.id, author: r.author, authorId: r.author_id, body: r.body, createdAt: iso(r.created_at)! }))),
  );
}

async function getComment(id: number): Promise<CommentDTO | null> {
  const row = await queryOne<CommentRow>(`${COMMENT_SELECT} WHERE c.id = $1`, [id]);
  if (!row) return null;
  const replies = await query<{ id: number; author: string | null; author_id: number | null; body: string; created_at: Date }>(
    `SELECT r.id, u.name AS author, r.author_id, r.body, r.created_at
     FROM attention_replies r LEFT JOIN users u ON u.id = r.author_id WHERE r.comment_id = $1 ORDER BY r.created_at`,
    [id],
  );
  return toDTO(row, replies.map((r) => ({ id: r.id, author: r.author, authorId: r.author_id, body: r.body, createdAt: iso(r.created_at)! })));
}

/** Cria o comentário; se o mesmo autor acabou de enviar o mesmo texto (clique repetido), devolve o existente. */
export async function addComment(clientId: number, authorId: number, body: string): Promise<CommentDTO> {
  await ensureSchema();
  const row = await queryOne<{ id: number }>(
    `WITH dup AS (
       SELECT id FROM attention_comments
       WHERE client_id = $1 AND author_id = $2 AND body = $3 AND created_at > now() - interval '${DUPLICATE_WINDOW}'
       ORDER BY id LIMIT 1
     ), ins AS (
       INSERT INTO attention_comments (client_id, author_id, body)
       SELECT $1, $2, $3 WHERE NOT EXISTS (SELECT 1 FROM dup) RETURNING id
     )
     SELECT id FROM ins UNION ALL SELECT id FROM dup`,
    [clientId, authorId, body],
  );
  return (await getComment(row!.id))!;
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

export async function addReply(commentId: number, authorId: number, body: string): Promise<ReplyDTO | null> {
  await ensureSchema();
  if (!(await queryOne("SELECT 1 FROM attention_comments WHERE id = $1", [commentId]))) return null;
  // Clique repetido: mesma resposta do mesmo autor há pouco → devolve a existente, sem notificar de novo.
  const dup = await queryOne<{ id: number; created_at: Date }>(
    `SELECT id, created_at FROM attention_replies
     WHERE comment_id = $1 AND author_id = $2 AND body = $3 AND created_at > now() - interval '${DUPLICATE_WINDOW}' LIMIT 1`,
    [commentId, authorId, body],
  );
  const row = dup ?? (await queryOne<{ id: number; created_at: Date }>(
    "INSERT INTO attention_replies (comment_id, author_id, body) VALUES ($1, $2, $3) RETURNING id, created_at",
    [commentId, authorId, body],
  ))!;
  if (!dup) await notify(commentId, authorId, "reply");
  const author = await queryOne<{ name: string }>("SELECT name FROM users WHERE id = $1", [authorId]);
  return { id: row.id, author: author?.name ?? null, authorId, body, createdAt: iso(row.created_at)! };
}

/** Muda a situação; devolve o comentário atualizado (também quando já estava nessa situação). */
export async function setStatus(commentId: number, actorId: number, status: CommentStatus): Promise<CommentDTO | null> {
  await ensureSchema();
  const rows = await query<{ id: number }>(
    `UPDATE attention_comments SET status = $2,
       closed_by = CASE WHEN $2 = 'open' THEN NULL ELSE $3::int END,
       closed_at = CASE WHEN $2 = 'open' THEN NULL ELSE now() END
     WHERE id = $1 AND status <> $2 RETURNING id`,
    [commentId, status, actorId],
  );
  if (rows.length) await notify(commentId, actorId, status === "open" ? "reopened" : status);
  return getComment(commentId);
}

export async function deleteComment(commentId: number, userId: number, master: boolean): Promise<boolean> {
  await ensureSchema();
  const rows = await query("DELETE FROM attention_comments WHERE id = $1 AND (author_id = $2 OR $3) RETURNING id", [commentId, userId, master]);
  return rows.length > 0;
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
