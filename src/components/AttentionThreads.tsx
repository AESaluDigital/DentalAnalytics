"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addCommentAction, deleteCommentAction, replyAction, setStatusAction } from "@/lib/actions/attention";
import type { CommentDTO, CommentStatus } from "@/lib/attention";

/**
 * Comentários de um cliente na Visão geral. Cada ação vai direto ao servidor e a tela se atualiza
 * com a resposta, sem recarregar a página. Enquanto envia, o botão fica desativado (evita duplicar).
 */

const STATUS_LABEL = { open: "em aberto", resolved: "concluído", dismissed: "descartado" } as const;

const when = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
    </svg>
  );
}

/** Formulário de texto com envio único: desativa enquanto envia e limpa ao concluir. */
function SendForm({ placeholder, label, multiline, onSend }: {
  placeholder: string; label: string; multiline?: boolean;
  onSend: (text: string) => Promise<string | null>;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const busy = useRef(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = text.trim();
    if (!value || busy.current) return;
    busy.current = true;
    setError(null);
    start(async () => {
      try {
        const err = await onSend(value);
        if (err) setError(err);
        else setText("");
      } catch {
        setError("Não foi possível enviar. Tente de novo.");
      } finally {
        busy.current = false;
      }
    });
  };

  return (
    <form onSubmit={submit} className={multiline ? "stack comment-form" : "row reply-form"} aria-busy={pending}>
      {multiline ? (
        <textarea value={text} onChange={(e) => setText(e.target.value)} required maxLength={2000} rows={3}
          placeholder={placeholder} aria-label={placeholder} disabled={pending} />
      ) : (
        <input type="text" value={text} onChange={(e) => setText(e.target.value)} required maxLength={2000}
          placeholder={placeholder} aria-label={placeholder} disabled={pending} />
      )}
      <div className="row" style={{ gap: 8 }}>
        <button className={`btn${multiline ? " primary" : ""}`} type="submit" disabled={pending || !text.trim()}>
          {pending ? "Enviando…" : label}
        </button>
        {error && <span className="error small" role="alert">{error}</span>}
      </div>
    </form>
  );
}

function Thread({ c, meId, master, onChange, onDelete }: {
  c: CommentDTO; meId: number; master: boolean;
  onChange: (c: CommentDTO) => void; onDelete: (id: number) => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const open = c.status === "open";

  const status = (s: CommentStatus) =>
    start(async () => {
      setError(null);
      const r = await setStatusAction(c.id, s).catch(() => null);
      if (r?.ok) onChange(r.data);
      else setError(r?.error ?? "Não foi possível atualizar.");
    });
  const remove = () => {
    if (!confirm("Excluir este comentário e as respostas?")) return;
    start(async () => {
      setError(null);
      const r = await deleteCommentAction(c.id).catch(() => null);
      if (r?.ok) onDelete(c.id);
      else setError(r?.error ?? "Não foi possível excluir.");
    });
  };

  return (
    <article id={`comentario-${c.id}`} className={`comment status-${c.status}`} aria-busy={pending}>
      <header className="row between">
        <span className="small">
          <strong>{c.author ?? "Usuário removido"}</strong> <span className="muted">· {when(c.createdAt)}</span>
        </span>
        <span className={`badge comment-badge-${c.status}`}>{STATUS_LABEL[c.status]}</span>
      </header>
      <p className="comment-body">{c.body}</p>
      {c.replies.map((r) => (
        <div key={r.id} className="reply">
          <span className="small"><strong>{r.author ?? "Usuário removido"}</strong> <span className="muted">· {when(r.createdAt)}</span></span>
          <p className="comment-body">{r.body}</p>
        </div>
      ))}
      {!open && c.closedAt && (
        <p className="muted small" style={{ margin: 0 }}>{STATUS_LABEL[c.status]} por {c.closedBy ?? "—"} em {when(c.closedAt)}</p>
      )}
      <SendForm placeholder="Responder…" label="Responder" onSend={async (text) => {
        const r = await replyAction(c.id, text);
        if (!r.ok) return r.error;
        onChange({ ...c, replies: [...c.replies.filter((x) => x.id !== r.data.id), r.data] });
        return null;
      }} />
      <div className="row" style={{ gap: 6 }}>
        {open ? (
          <>
            <button className="btn good-btn" type="button" disabled={pending} onClick={() => status("resolved")}>✓ Concluir</button>
            <button className="btn" type="button" disabled={pending} onClick={() => status("dismissed")}>Descartar</button>
          </>
        ) : (
          <button className="btn" type="button" disabled={pending} onClick={() => status("open")}>Reabrir</button>
        )}
        {(master || c.authorId === meId) && (
          <button className="btn danger-link" type="button" disabled={pending} onClick={remove}>Excluir</button>
        )}
        {pending && <span className="muted small">Salvando…</span>}
        {error && <span className="error small" role="alert">{error}</span>}
      </div>
    </article>
  );
}

export function ClientThreads({ clientId, initial, meId, master }: {
  clientId: number; initial: CommentDTO[]; meId: number; master: boolean;
}) {
  const [list, setList] = useState(initial);
  const [adding, setAdding] = useState(false);
  const open = list.filter((c) => c.status === "open");
  const closed = list.filter((c) => c.status !== "open");
  const replace = (c: CommentDTO) => setList((l) => l.map((x) => (x.id === c.id ? c : x)));
  const drop = (id: number) => setList((l) => l.filter((x) => x.id !== id));

  return (
    <>
      {open.map((c) => <Thread key={c.id} c={c} meId={meId} master={master} onChange={replace} onDelete={drop} />)}
      {closed.length > 0 && (
        <details className="closed-comments">
          <summary className="muted small">{closed.length} comentário(s) concluído(s)/descartado(s) recentemente</summary>
          {closed.map((c) => <Thread key={c.id} c={c} meId={meId} master={master} onChange={replace} onDelete={drop} />)}
        </details>
      )}
      {adding ? (
        <SendForm placeholder="Descreva o ponto de atenção…" label="Comentar" multiline onSend={async (text) => {
          const r = await addCommentAction(clientId, text);
          if (!r.ok) return r.error;
          setList((l) => [r.data, ...l.filter((x) => x.id !== r.data.id)]);
          setAdding(false);
          return null;
        }} />
      ) : (
        <button type="button" className="btn add-comment-btn" onClick={() => setAdding(true)}>
          <ChatIcon /> Comentar ponto de atenção
        </button>
      )}
    </>
  );
}

/** Comentário rápido da tabela (popover). Depois de enviar, atualiza a lista de atenção em segundo plano. */
export function QuickComment({ clientId, popoverId }: { clientId: number; popoverId: string }) {
  const router = useRouter();
  const [sent, setSent] = useState(false);
  return sent ? (
    <div className="stack">
      <p style={{ margin: 0 }}>✓ Comentário enviado. O cliente entra nos pontos de atenção.</p>
      <div className="row">
        <button type="button" className="btn" onClick={() => setSent(false)}>Comentar de novo</button>
        <button type="button" className="btn" popoverTarget={popoverId} popoverTargetAction="hide">Fechar</button>
      </div>
    </div>
  ) : (
    <SendForm placeholder="Descreva o ponto de atenção…" label="Comentar" multiline onSend={async (text) => {
      const r = await addCommentAction(clientId, text);
      if (!r.ok) return r.error;
      setSent(true);
      router.refresh();
      return null;
    }} />
  );
}
