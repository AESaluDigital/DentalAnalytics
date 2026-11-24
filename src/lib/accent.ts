/**
 * Cor principal escolhida pelo usuário (matiz 0–360 da roda cromática).
 * Gera as variáveis de cor da interface a partir do matiz, mantendo saturação/luminosidade
 * parecidas com o turquesa da marca, e escolhe o texto do botão (escuro ou branco) pelo contraste.
 * Sem escolha (null) = cores originais da marca.
 */

export const ACCENT_KEY = "accentHue";

export const ACCENT_PRESETS: { label: string; hue: number | null }[] = [
  { label: "Turquesa SuperDental (padrão)", hue: null },
  { label: "Azul", hue: 212 },
  { label: "Roxo", hue: 270 },
  { label: "Rosa", hue: 330 },
  { label: "Laranja", hue: 22 },
  { label: "Verde", hue: 140 },
];

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function accentVars(hue: number): Record<string, string> {
  const h = ((Math.round(hue) % 360) + 360) % 360;
  const base = `hsl(${h} 72% 42%)`;
  const ink = luminance(hslToRgb(h, 72, 42)) > 0.28 ? "#060E11" : "#FFFFFF";
  return {
    "--brand-teal": base,
    "--brand-teal-hi": `hsl(${h} 70% 50%)`,
    "--brand-teal-lo": `hsl(${h} 76% 30%)`,
    "--btn-bg": base,
    "--btn-bg-hover": `hsl(${h} 70% 50%)`,
    "--btn-ink": ink,
    "--accent-l": `hsl(${h} 76% 30%)`,
    "--accent-d": `hsl(${h} 70% 58%)`,
    "--orb-1": `hsl(${h} 70% 45% / 0.26)`,
  };
}

export function applyAccent(hue: number | null): void {
  const root = document.documentElement;
  const vars = accentVars(hue ?? 0);
  for (const k of Object.keys(vars)) root.style.removeProperty(k);
  if (hue === null) {
    delete root.dataset.accent;
    return;
  }
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.dataset.accent = "1";
}

export function savedAccent(): number | null {
  try {
    const v = localStorage.getItem(ACCENT_KEY);
    const n = v === null ? NaN : Number(v);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function saveAccent(hue: number | null): void {
  try {
    if (hue === null) localStorage.removeItem(ACCENT_KEY);
    else localStorage.setItem(ACCENT_KEY, String(Math.round(hue)));
  } catch {
    /* sem storage */
  }
}
