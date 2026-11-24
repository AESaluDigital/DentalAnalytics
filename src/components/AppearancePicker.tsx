"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ACCENT_PRESETS, applyAccent, saveAccent, savedAccent } from "@/lib/accent";

const WHEEL = 180;

type Theme = "light" | "dark";

/**
 * Aparência: tema claro/escuro e, no mesmo painel, a cor principal pela roda cromática
 * (clique ou arraste), com atalhos e "padrão da marca". Tudo fica salvo neste navegador.
 */
export default function AppearancePicker({ withLabel = false }: { withLabel?: boolean }) {
  const [open, setOpen] = useState(false);
  const [hue, setHue] = useState<number | null>(null);
  const [theme, setThemeState] = useState<Theme | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const wheel = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    setHue(savedAccent());
    setThemeState(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  }, []);

  const setTheme = (next: Theme) => {
    const root = document.documentElement;
    root.classList.add("theme-switching");
    root.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* sem storage */
    }
    setThemeState(next);
    window.setTimeout(() => root.classList.remove("theme-switching"), 400);
  };

  const choose = useCallback((h: number | null) => {
    setHue(h);
    applyAccent(h);
    saveAccent(h);
  }, []);

  // Fecha ao clicar fora ou com Esc.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const hueAt = (clientX: number, clientY: number) => {
    const r = wheel.current?.getBoundingClientRect();
    if (!r) return null;
    const x = clientX - (r.left + r.width / 2);
    const y = clientY - (r.top + r.height / 2);
    // 0° no topo, sentido horário (igual ao conic-gradient).
    return (Math.atan2(x, -y) * 180) / Math.PI + 360;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const h = hueAt(e.clientX, e.clientY);
    if (h !== null) choose(h % 360);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const h = hueAt(e.clientX, e.clientY);
    if (h !== null) choose(h % 360);
  };
  const onPointerUp = () => {
    dragging.current = false;
  };

  const onKeyWheel = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 30 : 5;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") choose(((hue ?? 173) + step) % 360);
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") choose(((hue ?? 173) - step + 360) % 360);
    else return;
    e.preventDefault();
  };

  const shown = hue ?? 173; // turquesa da marca
  const rad = ((shown - 90) * Math.PI) / 180;
  const ring = WHEEL / 2 - 14;

  return (
    <div className="accent-picker" ref={box}>
      <button type="button" className={`btn accent-btn theme-toggle${withLabel ? "" : " icon"}`} onClick={() => setOpen((o) => !o)}
        aria-expanded={open} aria-label="Aparência: tema e cor principal" title="Aparência: tema e cor principal">
        <span className="theme-icon" aria-hidden>{theme === "dark" ? "☾" : "☀"}</span>
        {withLabel && <span>Aparência</span>}
      </button>
      {open && (
        <div className="accent-pop" role="dialog" aria-label="Aparência">
          <strong className="accent-title">Tema</strong>
          <div className="seg theme-seg" role="group" aria-label="Tema">
            <button type="button" className="btn" aria-pressed={theme === "light"} onClick={() => setTheme("light")}>☀ Claro</button>
            <button type="button" className="btn" aria-pressed={theme === "dark"} onClick={() => setTheme("dark")}>☾ Escuro</button>
          </div>
          <strong className="accent-title">Cor principal</strong>
          <div
            ref={wheel}
            className="accent-wheel"
            style={{ width: WHEEL, height: WHEEL }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            role="slider"
            tabIndex={0}
            aria-label="Matiz da cor principal"
            aria-valuemin={0}
            aria-valuemax={359}
            aria-valuenow={Math.round(shown)}
            aria-valuetext={hue === null ? "Turquesa da marca" : `Matiz ${Math.round(shown)}°`}
            onKeyDown={onKeyWheel}
          >
            <span className="accent-center">
              <span className="accent-sample">Aa</span>
            </span>
            <span
              className="accent-knob"
              style={{ left: WHEEL / 2 + ring * Math.cos(rad), top: WHEEL / 2 + ring * Math.sin(rad), background: `hsl(${shown} 72% 42%)` }}
              aria-hidden
            />
          </div>
          <div className="accent-presets">
            {ACCENT_PRESETS.map((p) => (
              <button key={p.label} type="button" className={`accent-swatch${(p.hue ?? -1) === (hue ?? -1) ? " on" : ""}`}
                style={{ background: p.hue === null ? "#1BB5A4" : `hsl(${p.hue} 72% 42%)` }}
                onClick={() => choose(p.hue)} title={p.label} aria-label={p.label} />
            ))}
          </div>
          <button type="button" className="btn small-btn" onClick={() => choose(null)} disabled={hue === null}>
            Restaurar padrão da marca
          </button>
          <p className="muted small" style={{ margin: 0 }}>Clique ou arraste na roda. A escolha fica salva neste navegador.</p>
        </div>
      )}
    </div>
  );
}
