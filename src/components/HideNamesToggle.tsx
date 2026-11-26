"use client";

import { useEffect, useState } from "react";

const KEY = "overview-hide-names";
const CLASS = "hide-client-names";

/**
 * Olho que oculta os nomes dos clientes (para apresentar a tela sem expor a carteira).
 * Troca uma classe no <html>; o CSS mostra "Cliente 01", "Cliente 02"… no lugar do nome. Fica salvo no navegador.
 */
export default function HideNamesToggle() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(KEY) === "1";
    setHidden(saved);
    document.documentElement.classList.toggle(CLASS, saved);
    return () => document.documentElement.classList.remove(CLASS);
  }, []);

  const toggle = () => {
    const next = !hidden;
    setHidden(next);
    document.documentElement.classList.toggle(CLASS, next);
    localStorage.setItem(KEY, next ? "1" : "0");
  };

  return (
    <button type="button" className="btn icon eye-btn" onClick={toggle} aria-pressed={hidden}
      aria-label={hidden ? "Mostrar nomes dos clientes" : "Ocultar nomes dos clientes"}
      title={hidden ? "Mostrar nomes dos clientes" : "Ocultar nomes dos clientes"}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
        {hidden && <path d="M4 4l16 16" />}
      </svg>
    </button>
  );
}
