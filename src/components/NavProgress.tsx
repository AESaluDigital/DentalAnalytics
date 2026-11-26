"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Barra fina no topo que aparece no instante do clique em qualquer link interno e some quando a nova
 * página chega. Dá retorno imediato: sem ela, numa página dinâmica o clique parecia não ter funcionado
 * e a pessoa clicava de novo.
 */
export default function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [state, setState] = useState<"idle" | "on" | "done">("idle");

  // A URL mudou: a navegação terminou.
  useEffect(() => {
    setState((s) => (s === "on" ? "done" : s));
  }, [pathname, search]);

  useEffect(() => {
    if (state === "idle") return;
    // "done" some após a transição; "on" tem um limite de segurança caso a navegação seja cancelada.
    const t = setTimeout(() => setState("idle"), state === "done" ? 400 : 20_000);
    return () => clearTimeout(t);
  }, [state]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return; // mesma página / âncora
      setState("on");
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  if (state === "idle") return null;
  return <div className={`nav-progress ${state}`} role="progressbar" aria-label="Carregando página" />;
}
