"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

/** Alterna tema claro/escuro. A escolha fica salva no navegador (o padrão segue o sistema). */
export default function ThemeToggle({ withLabel = false }: { withLabel?: boolean }) {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    const root = document.documentElement;
    root.classList.add("theme-switching");
    root.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* sem storage */
    }
    setTheme(next);
    window.setTimeout(() => root.classList.remove("theme-switching"), 400);
  };

  const label = theme === "dark" ? "Usar tema claro" : "Usar tema escuro";
  return (
    <button type="button" className={`btn theme-toggle${withLabel ? "" : " icon"}`} onClick={toggle}
      aria-label={label} title={label}>
      <span className="theme-icon" aria-hidden>{theme === "dark" ? "☀" : "☾"}</span>
      {withLabel && <span>{theme === "dark" ? "Tema claro" : "Tema escuro"}</span>}
    </button>
  );
}
