"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { addDays } from "@/lib/dates";

interface Props {
  clients: { id: number; name: string }[];
  clientId: number;
  start: string;
  end: string;
  today: string;
}

const AUTO_MS = 5 * 60_000;

function presets(today: string) {
  const monthStart = `${today.slice(0, 8)}01`;
  const lastMonthEnd = addDays(monthStart, -1);
  return [
    { label: "Hoje", start: today, end: today },
    { label: "7 dias", start: addDays(today, -6), end: today },
    { label: "30 dias", start: addDays(today, -29), end: today },
    { label: "Mês atual", start: monthStart, end: today },
    { label: "Mês passado", start: `${lastMonthEnd.slice(0, 8)}01`, end: lastMonthEnd },
  ];
}

export default function DashboardToolbar({ clients, clientId, start, end, today }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [auto, setAuto] = useState(false);
  const [custom, setCustom] = useState({ start, end });

  useEffect(() => setCustom({ start, end }), [start, end]);

  useEffect(() => {
    try {
      setAuto(localStorage.getItem("dash:auto") === "1");
    } catch {
      /* sem storage */
    }
  }, []);

  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => startTransition(() => router.refresh()), AUTO_MS);
    return () => clearInterval(t);
  }, [auto, router]);

  const go = (next: { client?: number; start?: string; end?: string; refresh?: boolean }) => {
    const q = new URLSearchParams({
      client: String(next.client ?? clientId),
      start: next.start ?? start,
      end: next.end ?? end,
    });
    if (next.refresh) q.set("refresh", String(Date.now()));
    startTransition(() => router.push(`${pathname}?${q}`));
  };

  const options = presets(today);
  const idx = clients.findIndex((c) => c.id === clientId);

  return (
    <div className="card stack dash-toolbar no-print">
      <div className="row between">
        <div className="row">
          <button type="button" className="btn icon" aria-label="Cliente anterior" disabled={idx <= 0}
            onClick={() => go({ client: clients[idx - 1].id })}>←</button>
          <label className="sr-only" htmlFor="dash-client">Cliente</label>
          <select id="dash-client" value={clientId} onChange={(e) => go({ client: Number(e.target.value) })}
            className="dash-client">
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button type="button" className="btn icon" aria-label="Próximo cliente" disabled={idx < 0 || idx >= clients.length - 1}
            onClick={() => go({ client: clients[idx + 1].id })}>→</button>
        </div>
        <div className="row">
          {pending && <span className="muted small" aria-live="polite">Atualizando…</span>}
          <button type="button" className="btn" disabled={pending} onClick={() => go({ refresh: true })}>
            Atualizar agora
          </button>
          <label className="checkbox small">
            <input type="checkbox" checked={auto} onChange={(e) => {
              setAuto(e.target.checked);
              try { localStorage.setItem("dash:auto", e.target.checked ? "1" : "0"); } catch { /* sem storage */ }
            }} />
            Auto (5 min)
          </label>
        </div>
      </div>

      <div className="row between">
        <div className="seg" role="group" aria-label="Período">
          {options.map((p) => {
            const active = p.start === start && p.end === end;
            return (
              <button key={p.label} type="button" className="btn" aria-pressed={active}
                onClick={() => go({ start: p.start, end: p.end })}>
                {p.label}
              </button>
            );
          })}
        </div>
        <form className="row" onSubmit={(e) => { e.preventDefault(); if (custom.start <= custom.end) go(custom); }}>
          <input type="date" aria-label="Início" value={custom.start} max={custom.end}
            onChange={(e) => setCustom((c) => ({ ...c, start: e.target.value }))} />
          <input type="date" aria-label="Fim" value={custom.end} min={custom.start} max={today}
            onChange={(e) => setCustom((c) => ({ ...c, end: e.target.value }))} />
          <button className="btn" type="submit">Aplicar</button>
        </form>
      </div>
    </div>
  );
}
