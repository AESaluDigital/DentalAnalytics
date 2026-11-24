"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

const WIDTH = 280;

/**
 * Botão "i" com a explicação da métrica. Abre ao passar o mouse, focar (teclado) ou tocar.
 * O balão é renderizado no <body>, então não é cortado por tabelas com rolagem.
 */
export default function InfoTip({ text, label }: { text: string; label: string }) {
  const id = useId();
  const ref = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean } | null>(null);
  const [pinned, setPinned] = useState(false);

  const show = useCallback(() => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const half = WIDTH / 2 + 8;
    const left = Math.min(Math.max(r.left + r.width / 2, half), window.innerWidth - half);
    const below = r.top < 140;
    setPos({ left, top: below ? r.bottom + 8 : r.top - 8, below });
  }, []);

  const hide = useCallback(() => {
    setPos(null);
    setPinned(false);
  }, []);

  useEffect(() => {
    if (!pos) return;
    const close = () => hide();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && hide();
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [pos, hide]);

  return (
    <>
      <button
        ref={ref}
        type="button"
        className="info-btn no-print"
        aria-label={`O que é ${label}?`}
        aria-describedby={pos ? id : undefined}
        onMouseEnter={show}
        onMouseLeave={() => !pinned && hide()}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => {
          e.stopPropagation();
          if (pinned) hide();
          else {
            show();
            setPinned(true);
          }
        }}
      >
        i
      </button>
      {pos &&
        createPortal(
          <div
            role="tooltip"
            id={id}
            className={`info-pop${pos.below ? " below" : ""}`}
            style={{ left: pos.left, top: pos.top, width: WIDTH }}
          >
            <strong>{label}</strong>
            <span>{text}</span>
          </div>,
          document.body,
        )}
    </>
  );
}
