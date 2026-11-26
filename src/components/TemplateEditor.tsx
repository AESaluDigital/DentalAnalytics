"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteTemplateAction, saveTemplateAction } from "@/lib/actions/templates";
import {
  MAX_CARDS, MAX_METRICS_PER_CARD, METRIC_OPTIONS, SECTIONS, metricDef,
  type ReportLayout, type TemplateCard,
} from "@/lib/report-template";

/** Editor de modelo de relatório: quantos cards, quais métricas em cada um e quais seções completas aparecem. */
export default function TemplateEditor({ id, initialName, initial }: { id: number | null; initialName: string; initial: ReportLayout }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [cards, setCards] = useState<TemplateCard[]>(initial.cards);
  const [sections, setSections] = useState(initial.sections);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const busy = useRef(false);

  const edit = (i: number, fn: (c: TemplateCard) => TemplateCard) => {
    setMsg(null);
    setCards((l) => l.map((c, j) => (j === i ? fn(c) : c)));
  };
  const move = <T,>(list: T[], from: number, to: number) => {
    if (to < 0 || to >= list.length) return list;
    const n = [...list];
    const [x] = n.splice(from, 1);
    n.splice(to, 0, x);
    return n;
  };

  const save = () => {
    if (busy.current) return;
    busy.current = true;
    setMsg(null);
    start(async () => {
      try {
        const r = await saveTemplateAction(id, name, { cards, sections });
        if (!r.ok) setMsg({ ok: false, text: r.error });
        else if (id === null) router.push(`/reports/templates/${r.data.id}`);
        else {
          setMsg({ ok: true, text: "Modelo salvo. Os próximos relatórios gerados com ele já usam esta versão." });
          router.refresh();
        }
      } catch {
        setMsg({ ok: false, text: "Não foi possível salvar. Tente de novo." });
      } finally {
        busy.current = false;
      }
    });
  };

  const remove = () => {
    if (id === null || !confirm("Excluir este modelo? Os clientes que o usam voltam ao relatório completo.")) return;
    start(async () => {
      const r = await deleteTemplateAction(id).catch(() => null);
      if (r?.ok) router.push("/reports/templates");
      else setMsg({ ok: false, text: r?.error ?? "Não foi possível excluir." });
    });
  };

  return (
    <div className="stack">
      <section className="card stack">
        <label>
          Nome do modelo
          <input type="text" value={name} maxLength={120} placeholder="Ex.: Resumo mensal para clínicas"
            onChange={(e) => { setName(e.target.value); setMsg(null); }} />
        </label>
      </section>

      <section className="card stack">
        <div className="row between">
          <div>
            <h2>Cards de indicadores</h2>
            <p className="muted small" style={{ margin: 0 }}>
              Aparecem no topo do relatório, na ordem abaixo. Cada métrica mostra o valor do período e a variação contra o período anterior.
              Métricas sem dados para o cliente (ex.: sem GA4) ficam de fora automaticamente.
            </p>
          </div>
          <span className="badge">{cards.length} de {MAX_CARDS}</span>
        </div>

        {cards.length === 0 && <p className="muted" style={{ margin: 0 }}>Nenhum card. O relatório mostra só as seções marcadas abaixo.</p>}

        <div className="tpl-cards">
          {cards.map((c, i) => {
            const used = new Set(c.metrics);
            const full = c.metrics.length >= MAX_METRICS_PER_CARD;
            return (
              <div key={i} className="tpl-card">
                <div className="tpl-card-head">
                  <span className="tpl-num">{i + 1}</span>
                  <input type="text" value={c.title} maxLength={80} aria-label={`Título do card ${i + 1}`} placeholder="Título do card"
                    onChange={(e) => edit(i, (x) => ({ ...x, title: e.target.value }))} />
                  <div className="tpl-tools">
                    <button type="button" className="btn icon-btn" title="Subir" aria-label="Subir card" disabled={i === 0}
                      onClick={() => setCards((l) => move(l, i, i - 1))}>↑</button>
                    <button type="button" className="btn icon-btn" title="Descer" aria-label="Descer card" disabled={i === cards.length - 1}
                      onClick={() => setCards((l) => move(l, i, i + 1))}>↓</button>
                    <button type="button" className="btn icon-btn danger-link" title="Remover card" aria-label="Remover card"
                      onClick={() => setCards((l) => l.filter((_, j) => j !== i))}>✕</button>
                  </div>
                </div>

                <div className="tpl-metrics">
                  {c.metrics.map((m, k) => (
                    <span key={m} className="tpl-chip">
                      <button type="button" className="tpl-chip-move" aria-label="Mover para a esquerda" disabled={k === 0}
                        onClick={() => edit(i, (x) => ({ ...x, metrics: move(x.metrics, k, k - 1) }))}>‹</button>
                      {metricDef(m)?.fullLabel ?? m}
                      <button type="button" className="tpl-chip-x" aria-label={`Remover ${metricDef(m)?.fullLabel ?? m}`}
                        onClick={() => edit(i, (x) => ({ ...x, metrics: x.metrics.filter((y) => y !== m) }))}>✕</button>
                    </span>
                  ))}
                  {c.metrics.length === 0 && <span className="muted small">Sem métricas — o card não aparece no relatório.</span>}
                </div>

                <select value="" disabled={full} aria-label={`Adicionar métrica ao card ${i + 1}`}
                  onChange={(e) => { const v = e.target.value; if (v) edit(i, (x) => ({ ...x, metrics: [...x.metrics, v] })); }}>
                  <option value="">{full ? `Limite de ${MAX_METRICS_PER_CARD} métricas` : "+ Adicionar métrica…"}</option>
                  {METRIC_OPTIONS.map((g) => (
                    <optgroup key={g.source} label={g.label}>
                      {g.metrics.map((m) => <option key={m.id} value={m.id} disabled={used.has(m.id)}>{m.label}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>
            );
          })}
        </div>

        <div className="row">
          <button type="button" className="btn" disabled={cards.length >= MAX_CARDS}
            onClick={() => setCards((l) => [...l, { title: `Card ${l.length + 1}`, metrics: [] }])}>
            + Adicionar card
          </button>
        </div>
      </section>

      <section className="card stack">
        <div>
          <h2>Seções completas</h2>
          <p className="muted small" style={{ margin: 0 }}>Aparecem depois dos cards. Desmarque o que não deve ir para o cliente.</p>
        </div>
        <div className="tpl-sections">
          {SECTIONS.map((s) => (
            <label key={s.key} className="checkbox">
              <input type="checkbox" checked={sections[s.key]}
                onChange={(e) => { setMsg(null); setSections((x) => ({ ...x, [s.key]: e.target.checked })); }} />
              {s.label}
            </label>
          ))}
        </div>
      </section>

      <div className="row">
        <button type="button" className="btn primary" disabled={pending || !name.trim()} onClick={save}>
          {pending ? "Salvando…" : id === null ? "Criar modelo" : "Salvar modelo"}
        </button>
        {id !== null && <button type="button" className="btn danger" disabled={pending} onClick={remove}>Excluir modelo</button>}
        {msg && <span className={msg.ok ? "small ok-text" : "error small"} role={msg.ok ? "status" : "alert"}>{msg.text}</span>}
      </div>
    </div>
  );
}
