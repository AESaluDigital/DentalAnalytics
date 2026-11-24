"use client";

import { useActionState, useState } from "react";
import { generateReportAction, type GenerateState } from "@/lib/actions/reports";
import { addDays } from "@/lib/dates";

/** Presets calculados a partir de "hoje" vindo do servidor (evita divergência de fuso). */
function presets(today: string) {
  const yesterday = addDays(today, -1);
  const daysBack = (n: number) => ({ start: addDays(yesterday, -(n - 1)), end: yesterday });
  const monthStart = `${today.slice(0, 8)}01`;
  const lastMonthEnd = addDays(monthStart, -1);
  const lastMonthStart = `${lastMonthEnd.slice(0, 8)}01`;
  return [
    { label: "Últimos 7 dias", ...daysBack(7) },
    { label: "Últimos 30 dias", ...daysBack(30) },
    { label: "Mês passado", start: lastMonthStart, end: lastMonthEnd },
    ...(today !== monthStart ? [{ label: "Mês atual", start: monthStart, end: yesterday }] : []),
  ];
}

export default function GenerateReportForm({ clientId, today }: { clientId: number; today: string }) {
  const [state, action, pending] = useActionState<GenerateState, FormData>(generateReportAction, {});
  const options = presets(today);
  const [range, setRange] = useState({ start: options[2].start, end: options[2].end });

  return (
    <form action={action} className="card stack">
      <h2>Gerar relatório</h2>
      <input type="hidden" name="clientId" value={clientId} />
      <div className="seg" role="group" aria-label="Período">
        {options.map((p) => {
          const active = p.start === range.start && p.end === range.end;
          return (
            <button
              key={p.label}
              type="button"
              className="btn"
              aria-pressed={active}
              onClick={() => setRange({ start: p.start, end: p.end })}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <div className="field-row">
        <label>
          Início
          <input type="date" name="start" required value={range.start} max={range.end}
            onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))} />
        </label>
        <label>
          Fim
          <input type="date" name="end" required value={range.end} min={range.start} max={today}
            onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))} />
        </label>
      </div>
      <p className="muted small">A comparação é feita com o período anterior de mesma duração.</p>
      {state.error && <p className="error" role="alert">{state.error}</p>}
      <div className="row">
        <button className="btn primary" type="submit" disabled={pending}>
          {pending ? "Gerando… (pode levar até 1 minuto)" : "Gerar relatório"}
        </button>
      </div>
    </form>
  );
}
