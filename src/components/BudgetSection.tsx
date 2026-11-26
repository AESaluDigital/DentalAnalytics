"use client";

import { useMemo, useState } from "react";
import { saveBudgetAction } from "@/lib/actions/budget";
import type { BudgetData, BudgetPlatform } from "@/lib/budget";
import { addDays, eachDay, formatDateBr } from "@/lib/dates";
import { money, pct } from "@/lib/format";
import { METRIC_HELP, type MetricKey } from "@/lib/metric-help";
import InfoTip from "./InfoTip";
import { BudgetChart } from "./report/Charts";

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function Stat({ label, help, value, note, tone }: { label: string; help: MetricKey; value: string; note?: string; tone?: "good" | "bad" | "warn" }) {
  return (
    <div className={`kpi${tone ? ` kpi-tone-${tone}` : ""}`}>
      <span className="kpi-label">{label}<InfoTip label={label} text={METRIC_HELP[help]} /></span>
      <span className="kpi-value">{value}</span>
      {note && <span className="kpi-delta"><span className="muted">{note}</span></span>}
    </div>
  );
}

/** Formata para o campo do formulário (ex.: 5000 → "5.000,00"). */
const toInput = (v: number | null) =>
  v === null ? "" : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Gasto médio diário dos últimos 7 dias completos (hoje ainda está em andamento). */
function avg7(p: BudgetPlatform): number {
  const done = p.daily.slice(0, -1).slice(-7);
  return done.length ? done.reduce((a, d) => a + d.spend, 0) / done.length : (p.daily.at(-1)?.spend ?? 0);
}

/** Dias de saldo: saldo disponível na conta ÷ gasto médio diário real (usa o orçamento diário se não houve gasto). */
function fundsDays(p: BudgetPlatform): { days: number; by: "real" | "budget" } | null {
  const rest = p.account?.remaining;
  if (rest === null || rest === undefined) return null;
  const real = avg7(p);
  if (real > 0) return { days: rest / real, by: "real" };
  const budget = p.account?.dailyBudget;
  return budget ? { days: rest / budget, by: "budget" } : null;
}

const daysText = (d: number) => (d < 1 ? "menos de 1 dia" : `${Math.floor(d)} dia${Math.floor(d) === 1 ? "" : "s"}`);
const daysTone = (d: number): "bad" | "warn" | "good" => (d <= 3 ? "bad" : d <= 7 ? "warn" : "good");
const daysCell = (p: BudgetPlatform) => {
  const f = fundsDays(p);
  return f ? daysText(f.days) : "—";
};

/** Saldo que a própria conta de anúncios informa (no Google: "Orçamento restante da conta") e quantos dias ele dura. */
function AccountFundsBlock({ platforms, showLabels, today }: { platforms: BudgetPlatform[]; showLabels: boolean; today: string }) {
  const list = platforms.filter((p) => p.account && (p.account.remaining !== null || p.account.text));
  if (list.length === 0) return null;
  return (
    <div className="funds">
      <h3 className="chart-title">Saldo na conta de anúncios</h3>
      {list.map((p) => {
        const a = p.account!;
        if (a.remaining === null) {
          return (
            <p key={p.key} className="muted small funds-note">
              <strong>{p.label}:</strong> {a.text ?? "a conta não informa saldo"}
            </p>
          );
        }
        const f = fundsDays(p);
        const real = avg7(p);
        const usedPct = a.limit && a.spent !== null ? a.spent / a.limit : null;
        const end = f && f.days >= 1 ? formatDateBr(addDays(today, Math.floor(f.days))).slice(0, 5) : null;
        const byBudget = a.dailyBudget ? a.remaining / a.dailyBudget : null;
        const tone = f ? daysTone(f.days) : undefined;
        return (
          <div key={p.key} className="funds-row">
            {showLabels && <strong className="funds-label">{p.label}</strong>}
            <div className="kpi-grid">
              <Stat label="Saldo disponível" help="accountRemaining" value={money(a.remaining, p.currency)}
                tone={tone === "good" ? undefined : tone}
                note={a.limit ? `de ${money(a.limit, p.currency)}${usedPct !== null ? ` · ${pct(usedPct)} gasto` : ""}` : undefined} />
              <Stat label="Gasto médio diário" help="dailyPace" value={money(real, p.currency)} note="últimos 7 dias" />
              {a.dailyBudget !== null && (
                <Stat label="Orçamento diário total" help="dailyBudgetTotal" value={money(a.dailyBudget, p.currency)} note="campanhas ativas" />
              )}
              <Stat label="Dias de saldo" help="daysOfFunds" value={f ? daysText(f.days) : "—"} tone={tone}
                note={[
                  end ? `acaba por volta de ${end}` : f ? "recarregue hoje" : "sem gasto recente",
                  f?.by === "real" && byBudget !== null ? `pelo orçamento diário: ${daysText(byBudget)}` : null,
                  f?.by === "budget" ? "calculado pelo orçamento diário" : null,
                ].filter(Boolean).join(" · ")} />
            </div>
            {usedPct !== null && (
              <div className="budget-bar" role="img" aria-label={`${pct(usedPct)} do orçamento da conta já gasto`}>
                <span className={tone === "bad" ? "over" : undefined} style={{ width: `${Math.min(usedPct, 1) * 100}%` }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function BudgetSection({
  data,
  clientId,
  canEdit,
  back,
  ok,
  error,
}: {
  data: BudgetData;
  clientId: number;
  canEdit: boolean;
  back: string;
  ok?: boolean;
  error?: string;
}) {
  const [sel, setSel] = useState<string>("all");
  const [editing, setEditing] = useState(false);
  const platform = data.platforms.find((p) => p.key === sel) ?? null;
  const picked: BudgetPlatform[] = platform ? [platform] : data.platforms;
  const currency = picked[0]?.currency ?? "BRL";
  const day = Number(data.today.slice(8, 10));
  const daysLeft = data.daysInMonth - day; // dias depois de hoje

  const v = useMemo(() => {
    const dates = eachDay({ start: data.month, end: data.today });
    const daily = dates.map((date) => ({
      date,
      spend: picked.reduce((a, p) => a + (p.daily.find((d) => d.date === date)?.spend ?? 0), 0),
    }));
    const spent = daily.reduce((a, d) => a + d.spend, 0);
    const todaySpend = daily.at(-1)?.spend ?? 0;
    // Ritmo: média dos últimos 7 dias completos (hoje ainda está em andamento).
    const complete = daily.slice(0, -1).slice(-7);
    const avg = complete.length ? complete.reduce((a, d) => a + d.spend, 0) / complete.length : todaySpend;
    const projected = spent + Math.max(avg - todaySpend, 0) + avg * daysLeft;

    const setBudgets = picked.map((p) => p.budget).filter((b): b is number => b !== null);
    const budget = platform ? platform.budget : data.totalBudget ?? (setBudgets.length ? setBudgets.reduce((a, b) => a + b, 0) : null);


    // Gráfico: acumulado real até hoje e projeção de hoje até o fim do mês.
    let acc = 0;
    const byDate = new Map(daily.map((d) => [d.date, d.spend]));
    const chart = eachDay({ start: data.month, end: `${data.month.slice(0, 8)}${String(data.daysInMonth).padStart(2, "0")}` }).map((date, i) => {
      const n = i + 1;
      if (n <= day) acc += byDate.get(date) ?? 0;
      const projVal = n < day ? null : n === day ? spent : spent + Math.max(avg - todaySpend, 0) + avg * (n - day);
      return { date, real: n <= day ? acc : null, proj: projVal };
    });

    return { spent, avg, projected, budget, chart };
  }, [picked, platform, data, day, daysLeft]);

  const remaining = v.budget === null ? null : v.budget - v.spent;
  const perDay = remaining === null ? null : remaining / (daysLeft + 1);
  const diff = v.budget === null ? null : v.projected - v.budget;
  const used = v.budget ? v.spent / v.budget : null;
  const monthLabel = `${MONTHS[Number(data.month.slice(5, 7)) - 1]} de ${data.month.slice(0, 4)}`;
  const errors = picked.filter((p) => p.error);

  return (
    <section id="orcamento" className="card report-section budget">
      <div className="row between">
        <div>
          <h2 className="section-title"><span className="swatch" style={{ background: "var(--series-3)" }} aria-hidden /> Orçamento — {monthLabel}</h2>
          <p className="muted small" style={{ margin: "4px 0 0" }}>
            Sempre o mês atual (até hoje, dia {day} de {data.daysInMonth}), independente do período escolhido acima.
          </p>
        </div>
        <div className="row">
          {data.platforms.length > 1 && (
            <div className="seg" role="group" aria-label="Plataforma do orçamento">
              <button type="button" className="btn" aria-pressed={sel === "all"} onClick={() => setSel("all")}>Geral</button>
              {data.platforms.map((p) => (
                <button key={p.key} type="button" className="btn" aria-pressed={sel === p.key} onClick={() => setSel(p.key)}>{p.label}</button>
              ))}
            </div>
          )}
          {canEdit && (
            <button type="button" className="btn no-print" onClick={() => setEditing((e) => !e)} aria-expanded={editing}>
              {editing ? "Fechar" : "Definir orçamento"}
            </button>
          )}
        </div>
      </div>

      {ok && <p className="notice ok" role="status">Orçamento salvo.</p>}
      {error && <p className="notice err" role="alert">{error}</p>}

      {canEdit && editing && (
        <form action={saveBudgetAction} className="budget-form no-print">
          <input type="hidden" name="clientId" value={clientId} />
          <input type="hidden" name="back" value={back} />
          {data.platforms.map((p) => (
            <label key={p.key}>
              {p.label} — orçamento de {monthLabel}
              <input type="text" name={p.key} inputMode="decimal" defaultValue={toInput(p.budget)} placeholder="ex.: 5.000,00" />
            </label>
          ))}
          <label>
            Total geral (opcional)
            <input type="text" name="total" inputMode="decimal" defaultValue={toInput(data.totalBudget)} placeholder="vazio = soma das plataformas" />
          </label>
          <div className="form-actions">
            <button className="btn primary" type="submit">Salvar orçamento</button>
          </div>
          <p className="muted small" style={{ margin: 0, gridColumn: "1 / -1" }}>
            Valor que o cliente disponibilizou para investir neste mês. Deixe vazio para remover.
          </p>
        </form>
      )}

      {errors.map((p) => <p key={p.key} className="error small" style={{ margin: 0 }}>⚠ {p.label}: {p.error}</p>)}

      <div className="kpi-grid">
        <Stat label="Orçamento do mês" help="budget" value={v.budget === null ? "—" : money(v.budget, currency)}
          note={v.budget === null ? (canEdit ? "clique em Definir orçamento" : "não definido") : undefined} />
        <Stat label="Investido até agora" help="spentMtd" value={money(v.spent, currency)}
          note={used === null ? undefined : `${pct(used)} do orçamento`} />
        <Stat label="Restante do orçamento" help="budgetLeft" value={remaining === null ? "—" : money(remaining, currency)}
          tone={remaining === null ? undefined : remaining >= 0 ? "good" : "bad"} />
        <Stat label="Média diária (7 dias)" help="dailyPace" value={money(v.avg, currency)} />
        <Stat label="Ideal por dia até o fim" help="perDayLeft" value={perDay === null ? "—" : money(Math.max(perDay, 0), currency)}
          note={perDay === null ? undefined : `${daysLeft + 1} dia(s) restantes`} />
        <Stat label="Projeção até o fim do mês" help="projection" value={money(v.projected, currency)}
          tone={diff === null ? undefined : diff > 0 ? "bad" : "good"}
          note={diff === null ? undefined : diff > 0 ? `${money(diff, currency)} acima do orçamento` : `${money(-diff, currency)} abaixo do orçamento`} />
      </div>

      <AccountFundsBlock platforms={picked} showLabels={data.platforms.length > 1} today={data.today} />

      {v.budget !== null && used !== null && (
        <div className="budget-bar" role="img" aria-label={`${pct(used)} do orçamento usado`}>
          <span className={used > 1 ? "over" : undefined} style={{ width: `${Math.min(used, 1) * 100}%` }} />
          <span className="budget-bar-proj" style={{ left: `${Math.min(v.projected / v.budget, 1) * 100}%` }}
            title={`Projeção: ${money(v.projected, currency)}`} />
        </div>
      )}

      <div>
        <h3 className="chart-title">Gasto acumulado no mês, projeção e orçamento</h3>
        <BudgetChart data={v.chart} budget={v.budget} currency={currency} />
      </div>

      {!platform && data.platforms.length > 1 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Plataforma</th>
                <th className="num">Orçamento</th>
                <th className="num">Investido</th>
                <th className="num">Restante</th>
                <th className="num">Projeção</th>
                <th className="num">Saldo na conta</th>
                <th className="num">Dias de saldo</th>
              </tr>
            </thead>
            <tbody>
              {data.platforms.map((p) => {
                const spent = p.daily.reduce((a, d) => a + d.spend, 0);
                const todayS = p.daily.at(-1)?.spend ?? 0;
                const comp = p.daily.slice(0, -1).slice(-7);
                const avg = comp.length ? comp.reduce((a, d) => a + d.spend, 0) / comp.length : todayS;
                const proj = spent + Math.max(avg - todayS, 0) + avg * daysLeft;
                const rest = p.budget === null ? null : p.budget - spent;
                return (
                  <tr key={p.key}>
                    <td className="name"><button type="button" className="link-btn" onClick={() => setSel(p.key)}>{p.label}</button></td>
                    <td className="num">{p.budget === null ? "—" : money(p.budget, p.currency)}</td>
                    <td className="num">{money(spent, p.currency)}</td>
                    <td className={`num${rest === null ? "" : rest >= 0 ? " roas-good" : " roas-bad"}`}>{rest === null ? "—" : money(rest, p.currency)}</td>
                    <td className={`num${p.budget === null ? "" : proj > p.budget ? " roas-bad" : " roas-good"}`}>{money(proj, p.currency)}</td>
                    <td className="num">
                      {p.account?.remaining !== null && p.account?.remaining !== undefined ? money(p.account.remaining, p.currency) : p.account?.text ?? "—"}
                    </td>
                    <td className="num">{daysCell(p)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
