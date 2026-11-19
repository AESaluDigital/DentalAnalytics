import type { DateRange } from "./types";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function toUtc(d: string): Date {
  return new Date(`${d}T00:00:00Z`);
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function isIsoDate(v: string): boolean {
  return ISO.test(v) && !Number.isNaN(toUtc(v).getTime()) && fmt(toUtc(v)) === v;
}

export function daysBetween(range: DateRange): number {
  return Math.round((toUtc(range.end).getTime() - toUtc(range.start).getTime()) / 86_400_000) + 1;
}

/** Período anterior de mesma duração, imediatamente antes do período informado. */
export function previousRange(range: DateRange): DateRange {
  const len = daysBetween(range);
  const end = toUtc(range.start);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (len - 1));
  return { start: fmt(start), end: fmt(end) };
}

/** Lista todas as datas do período (para preencher dias sem dados com zero). */
export function eachDay(range: DateRange): string[] {
  const out: string[] = [];
  const cur = toUtc(range.start);
  const end = toUtc(range.end);
  while (cur <= end) {
    out.push(fmt(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

export function todayIso(): string {
  // Data local do servidor em America/Sao_Paulo
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

export function addDays(d: string, n: number): string {
  const x = toUtc(d);
  x.setUTCDate(x.getUTCDate() + n);
  return fmt(x);
}

export function formatDateBr(d: string): string {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}
