"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { generateOneReportAction } from "@/lib/actions/reports";
import { addDays } from "@/lib/dates";

interface ClientOpt {
  id: number;
  name: string;
  hasAccounts: boolean;
}

type Status =
  | { s: "wait" }
  | { s: "run" }
  | { s: "ok"; id: string }
  | { s: "err"; error: string };

const CONCURRENCY = 3;

function presets(today: string) {
  const yesterday = addDays(today, -1);
  const back = (n: number) => ({ start: addDays(yesterday, -(n - 1)), end: yesterday });
  const monthStart = `${today.slice(0, 8)}01`;
  const lastMonthEnd = addDays(monthStart, -1);
  return [
    { label: "Mês passado", start: `${lastMonthEnd.slice(0, 8)}01`, end: lastMonthEnd },
    { label: "Últimos 7 dias", ...back(7) },
    { label: "Últimos 30 dias", ...back(30) },
    ...(today !== monthStart ? [{ label: "Mês atual", start: monthStart, end: yesterday }] : []),
  ];
}

export default function BulkReports({
  clients,
  today,
  initial,
  templates,
}: {
  clients: ClientOpt[];
  today: string;
  initial: { clientId: number | null; start: string | null; end: string | null; template: number | null };
  templates: { id: number; name: string }[];
}) {
  const router = useRouter();
  const options = presets(today);
  const [range, setRange] = useState({
    start: initial.start ?? options[0].start,
    end: initial.end ?? options[0].end,
  });
  const eligible = useMemo(() => clients.filter((c) => c.hasAccounts), [clients]);
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(initial.clientId ? [initial.clientId] : eligible.map((c) => c.id)),
  );
  const [withAnalysis, setWithAnalysis] = useState(true);
  const [template, setTemplate] = useState<string>(
    initial.template && templates.some((t) => t.id === initial.template) ? String(initial.template) : "client",
  );
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState<Map<number, Status>>(new Map());
  const [running, setRunning] = useState(false);

  const visible = clients.filter((c) => c.name.toLowerCase().includes(filter.trim().toLowerCase()));
  const allOn = eligible.length > 0 && eligible.every((c) => selected.has(c.id));
  const done = [...status.values()].filter((x) => x.s === "ok" || x.s === "err").length;
  const total = status.size;
  const validRange = range.start <= range.end && range.end <= today;

  const toggle = (id: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const run = async () => {
    const ids = eligible.filter((c) => selected.has(c.id)).map((c) => c.id);
    if (!ids.length || !validRange) return;
    setRunning(true);
    setStatus(new Map(ids.map((id) => [id, { s: "wait" } as Status])));
    const set = (id: number, st: Status) => setStatus((m) => new Map(m).set(id, st));

    const queue = [...ids];
    const worker = async () => {
      for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
        set(id, { s: "run" });
        try {
          const r = await generateOneReportAction(id, range.start, range.end, withAnalysis,
            template === "client" || template === "none" ? template : Number(template));
          set(id, r.ok ? { s: "ok", id: r.id } : { s: "err", error: r.error });
        } catch {
          set(id, { s: "err", error: "Tempo esgotado ou conexão perdida." });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker));
    setRunning(false);
    router.refresh();
  };

  const nameOf = new Map(clients.map((c) => [c.id, c.name]));

  return (
    <section className="card stack bulk">
      <div className="card-head">
        <div>
          <h2>Gerar relatórios</h2>
          <p className="muted small">Escolha o período e os clientes. Cada relatório fica salvo com link de compartilhamento.</p>
        </div>
      </div>

      <div className="bulk-grid">
        <div className="stack" style={{ gap: 12 }}>
          <span className="field-label">Período</span>
          <div className="seg" role="group" aria-label="Período">
            {options.map((p) => (
              <button key={p.label} type="button" className="btn" disabled={running}
                aria-pressed={p.start === range.start && p.end === range.end}
                onClick={() => setRange({ start: p.start, end: p.end })}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="field-row">
            <label>
              Início
              <input type="date" value={range.start} max={range.end} disabled={running}
                onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))} />
            </label>
            <label>
              Fim
              <input type="date" value={range.end} min={range.start} max={today} disabled={running}
                onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))} />
            </label>
          </div>
          <label>
            Modelo do relatório
            <select value={template} disabled={running} onChange={(e) => setTemplate(e.target.value)}>
              <option value="client">Modelo de cada cliente (padrão)</option>
              <option value="none">Relatório completo (sem modelo)</option>
              {templates.length > 0 && (
                <optgroup label="Mesmo modelo para todos os selecionados">
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </optgroup>
              )}
            </select>
          </label>
          <span className="muted small" style={{ marginTop: -6 }}>
            <Link href="/reports/templates">Criar ou editar modelos →</Link>
          </span>
          <label className="checkbox">
            <input type="checkbox" checked={withAnalysis} disabled={running} onChange={(e) => setWithAnalysis(e.target.checked)} />
            Incluir resumo com IA (mais lento)
          </label>
        </div>

        <div className="stack" style={{ gap: 10 }}>
          <div className="row between">
            <span className="field-label">Clientes ({selected.size} de {eligible.length})</span>
            <button type="button" className="btn small-btn" disabled={running}
              onClick={() => setSelected(allOn ? new Set() : new Set(eligible.map((c) => c.id)))}>
              {allOn ? "Desmarcar todos" : "Selecionar todos"}
            </button>
          </div>
          <input type="search" placeholder="Buscar cliente…" value={filter} onChange={(e) => setFilter(e.target.value)}
            aria-label="Buscar cliente" />
          <div className="bulk-list" role="group" aria-label="Clientes">
            {visible.map((c) => {
              const st = status.get(c.id);
              return (
                <label key={c.id} className={`bulk-item${c.hasAccounts ? "" : " off"}`}>
                  <input type="checkbox" checked={selected.has(c.id)} disabled={!c.hasAccounts || running}
                    onChange={() => toggle(c.id)} />
                  <span className="bulk-name">{c.name}</span>
                  {!c.hasAccounts && <span className="muted small">sem contas</span>}
                  {st?.s === "run" && <span className="spinner" aria-label="gerando" />}
                  {st?.s === "wait" && <span className="muted small">na fila</span>}
                  {st?.s === "ok" && <Link className="small" href={`/reports/${st.id}`}>✓ abrir</Link>}
                  {st?.s === "err" && <span className="error small" title={st.error}>✗ {st.error}</span>}
                </label>
              );
            })}
            {visible.length === 0 && <p className="muted small" style={{ margin: 8 }}>Nenhum cliente.</p>}
          </div>
        </div>
      </div>

      {total > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
            <span style={{ width: `${(done / total) * 100}%` }} />
          </div>
          <span className="muted small" aria-live="polite">
            {running ? `Gerando… ${done} de ${total} concluídos` : `Concluído: ${done} de ${total}.`}
            {!running && [...status.entries()].some(([, v]) => v.s === "err") &&
              ` Falharam: ${[...status.entries()].filter(([, v]) => v.s === "err").map(([id]) => nameOf.get(id)).join(", ")}.`}
          </span>
        </div>
      )}

      <div className="row">
        <button type="button" className="btn primary" onClick={run} disabled={running || selected.size === 0 || !validRange}>
          {running ? "Gerando…" : `Gerar ${selected.size} relatório${selected.size === 1 ? "" : "s"}`}
        </button>
        {!validRange && <span className="error small">Período inválido.</span>}
      </div>
    </section>
  );
}
