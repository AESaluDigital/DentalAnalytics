"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { applyTemplateAction, unassignTemplateAction } from "@/lib/actions/templates";

interface ClientOpt {
  id: number;
  name: string;
  /** Nome do modelo que o cliente usa hoje (null = relatório completo). */
  current: { id: number; name: string } | null;
}

/** Define o modelo como padrão de todos os clientes ou de clientes escolhidos, e atalhos para gerar com ele. */
export default function TemplateApply({ templateId, templateName, clients }: { templateId: number; templateName: string; clients: ClientOpt[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const using = clients.filter((c) => c.current?.id === templateId);
  const visible = clients.filter((c) => c.name.toLowerCase().includes(filter.trim().toLowerCase()));

  const run = (fn: () => Promise<{ ok: true; data: { count: number } } | { ok: false; error: string }>, done: (n: number) => string) =>
    start(async () => {
      setMsg(null);
      const r = await fn().catch(() => null);
      if (r?.ok) {
        setMsg({ ok: true, text: done(r.data.count) });
        setSelected(new Set());
        router.refresh();
      } else setMsg({ ok: false, text: r?.error ?? "Não foi possível aplicar." });
    });

  const toggle = (id: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const plural = (n: number) => `${n} cliente${n === 1 ? "" : "s"}`;

  return (
    <section className="card stack">
      <div>
        <h2>Aplicar aos clientes</h2>
        <p className="muted small" style={{ margin: 0 }}>
          O modelo vira o padrão do cliente: todo relatório gerado para ele (na tela Relatórios ou na página do cliente) usa este formato.
          Também dá para escolher o modelo só na hora de gerar.
        </p>
      </div>

      <div className="row">
        <button type="button" className="btn primary" disabled={pending}
          onClick={() => confirm(`Usar "${templateName}" como modelo de todos os clientes ativos?`) &&
            run(() => applyTemplateAction(templateId, "all"), (n) => `Aplicado a todos os clientes (${plural(n)}).`)}>
          Aplicar a todos os clientes
        </button>
        <Link className="btn" href={`/reports?template=${templateId}`}>Gerar relatórios com este modelo →</Link>
      </div>

      <div className="stack" style={{ gap: 10 }}>
        <div className="row between">
          <span className="field-label">Ou escolha os clientes ({selected.size} selecionado{selected.size === 1 ? "" : "s"})</span>
          <button type="button" className="btn small-btn" disabled={pending || selected.size === 0}
            onClick={() => run(() => applyTemplateAction(templateId, [...selected]), (n) => `Aplicado a ${plural(n)}.`)}>
            Aplicar aos selecionados
          </button>
        </div>
        <input type="search" placeholder="Buscar cliente…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Buscar cliente" />
        <div className="bulk-list" role="group" aria-label="Clientes">
          {visible.map((c) => (
            <label key={c.id} className="bulk-item">
              <input type="checkbox" checked={selected.has(c.id)} disabled={pending} onChange={() => toggle(c.id)} />
              <span className="bulk-name">{c.name}</span>
              {c.current?.id === templateId ? (
                <span className="badge status-ok">usa este modelo</span>
              ) : c.current ? (
                <span className="muted small">modelo: {c.current.name}</span>
              ) : (
                <span className="muted small">relatório completo</span>
              )}
            </label>
          ))}
          {visible.length === 0 && <p className="muted small" style={{ margin: 8 }}>Nenhum cliente.</p>}
        </div>
      </div>

      {using.length > 0 && (
        <div className="row">
          <span className="muted small">Usam este modelo: {plural(using.length)}.</span>
          <button type="button" className="btn small-btn" disabled={pending}
            onClick={() => confirm("Tirar este modelo de todos os clientes que o usam? Eles voltam ao relatório completo.") &&
              run(() => unassignTemplateAction(templateId, using.map((c) => c.id)), (n) => `Modelo removido de ${plural(n)}.`)}>
            Remover de todos
          </button>
        </div>
      )}

      {pending && <span className="muted small">Aplicando…</span>}
      {msg && <span className={msg.ok ? "small ok-text" : "error small"} role={msg.ok ? "status" : "alert"}>{msg.text}</span>}
    </section>
  );
}
