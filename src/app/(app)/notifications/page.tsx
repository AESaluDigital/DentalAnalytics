import Link from "next/link";
import { can, requireUser } from "@/lib/auth";
import { listNotifications, type NotificationRow } from "@/lib/attention";
import { markNotificationsReadAction } from "@/lib/actions/attention";

export const dynamic = "force-dynamic";

const TEXT: Record<NotificationRow["kind"], string> = {
  reply: "respondeu",
  resolved: "concluiu",
  dismissed: "descartou",
  reopened: "reabriu",
};

const when = (d: Date) =>
  d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default async function NotificationsPage() {
  const user = await requireUser();
  const list = await listNotifications(user.id);
  const unread = list.filter((n) => !n.read).length;
  const canOverview = can(user, "view_overview");

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <span className="eyebrow">Pontos de atenção</span>
          <h1>Notificações</h1>
          <p className="muted small" style={{ margin: "4px 0 0" }}>Respostas e mudanças nos comentários de que você participa.</p>
        </div>
        {unread > 0 && (
          <form action={markNotificationsReadAction}>
            <button className="btn" type="submit">Marcar todas como lidas</button>
          </form>
        )}
      </div>

      {list.length === 0 ? (
        <p className="muted">Nenhuma notificação.</p>
      ) : (
        <div className="card stack notif-list">
          {list.map((n) => {
            const body = (
              <>
                <span>
                  <strong>{n.actor ?? "Alguém"}</strong> {TEXT[n.kind]} um comentário
                  {n.clientName && <> sobre <strong className="cname"><span className="cname-real">{n.clientName}</span><span className="cname-alias" aria-hidden>um cliente</span></strong></>}
                </span>
                {n.commentBody && <span className="muted small notif-quote">“{n.commentBody.length > 140 ? `${n.commentBody.slice(0, 140)}…` : n.commentBody}”</span>}
                <span className="muted small">{when(n.createdAt)}</span>
              </>
            );
            return canOverview && n.clientId ? (
              <Link key={n.id} href={`/overview#atencao-${n.clientId}`} className={`notif${n.read ? "" : " unread"}`}>{body}</Link>
            ) : (
              <div key={n.id} className={`notif${n.read ? "" : " unread"}`}>{body}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
