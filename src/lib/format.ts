const nf0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

export function money(v: number | null, currency = "BRL"): string {
  if (v === null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(v);
}

export function int(v: number | null): string {
  return v === null ? "—" : nf0.format(v);
}

export function dec(v: number | null): string {
  return v === null ? "—" : nf2.format(v);
}

export function short(v: number): string {
  return compact.format(v);
}

export function pct(v: number | null, digits = 1): string {
  if (v === null) return "—";
  return `${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

export function signedPct(v: number | null): string {
  if (v === null) return "—";
  const s = pct(Math.abs(v));
  return v > 0 ? `+${s}` : v < 0 ? `−${s}` : s;
}
