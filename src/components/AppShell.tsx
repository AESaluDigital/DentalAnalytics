"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { logoutAction } from "@/lib/actions/auth";
import Logo from "./Logo";
import AppearancePicker from "./AppearancePicker";
import NavProgress from "./NavProgress";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  /** Grupo no menu lateral. */
  group: "Principal" | "Clientes" | "Configurações";
}

interface Props {
  user: { name: string; email: string; master: boolean };
  /** Atalhos que ficam sempre visíveis na barra superior. */
  primary: NavItem[];
  /** Todas as opções (menu lateral). */
  items: NavItem[];
  demo: boolean;
  children: React.ReactNode;
}

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/clients");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AppShell({ user, primary, items, demo, children }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Fecha o menu ao navegar e com Esc.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.classList.add("no-scroll");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("no-scroll");
    };
  }, [open]);

  const groups = (["Principal", "Clientes", "Configurações"] as const)
    .map((g) => ({ g, list: items.filter((i) => i.group === g) }))
    .filter((x) => x.list.length > 0);

  return (
    <>
      <Suspense fallback={null}><NavProgress /></Suspense>
      <header className="topbar">
        <div className="inner">
          <div className="row" style={{ gap: 10, flexWrap: "nowrap" }}>
            <button type="button" className="btn icon menu-btn" aria-label="Abrir menu" aria-expanded={open}
              aria-controls="side-menu" onClick={() => setOpen(true)}>
              <span className="burger" aria-hidden><i /><i /><i /></span>
            </button>
            <Link href="/dashboard" className="brand" aria-label="SuperDental — início">
              <Logo height={32} />
              <span className="brand-sub">Relatórios</span>
            </Link>
            {demo && <span className="badge demo">modo demonstração</span>}
          </div>
          <nav aria-label="Principal" className="top-nav">
            {primary.map((i) => (
              <Link key={i.href} href={i.href} className={`nav-link${isActive(pathname, i.href) ? " active" : ""}`}
                aria-current={isActive(pathname, i.href) ? "page" : undefined}>
                <span aria-hidden>{i.icon}</span> {i.label}
              </Link>
            ))}
          </nav>
          <div className="row top-right">
            <AppearancePicker />
            <button type="button" className="user-chip" onClick={() => setOpen(true)} title={user.email}>
              <span className="user-avatar" aria-hidden>{user.name.trim().charAt(0).toUpperCase()}</span>
              <span className="user-chip-name">{user.name.split(" ")[0]}</span>
            </button>
          </div>
        </div>
      </header>

      <div className={`drawer-backdrop${open ? " open" : ""}`} onClick={() => setOpen(false)} aria-hidden />
      <aside id="side-menu" className={`drawer${open ? " open" : ""}`} aria-label="Menu" aria-hidden={!open}
        inert={!open}>
        <div className="drawer-head">
          <Logo height={30} />
          <button type="button" className="btn icon" aria-label="Fechar menu" onClick={() => setOpen(false)}>✕</button>
        </div>
        <nav className="drawer-nav">
          {groups.map(({ g, list }) => (
            <div key={g} className="drawer-group">
              <span className="drawer-label">{g}</span>
              {list.map((i, idx) => (
                <Link key={i.href} href={i.href} style={{ "--i": idx } as React.CSSProperties}
                  className={`drawer-link${isActive(pathname, i.href) ? " active" : ""}`}
                  aria-current={isActive(pathname, i.href) ? "page" : undefined}>
                  <span className="drawer-icon" aria-hidden>{i.icon}</span>
                  {i.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="drawer-foot">
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <span className="user-avatar lg" aria-hidden>{user.name.trim().charAt(0).toUpperCase()}</span>
            <div style={{ minWidth: 0 }}>
              <strong className="ellipsis">{user.name}</strong>
              <div className="muted small ellipsis">{user.email}{user.master ? " · master" : ""}</div>
            </div>
          </div>
          <div className="row">
            <AppearancePicker withLabel />
            <form action={logoutAction}>
              <button className="btn" type="submit">Sair</button>
            </form>
          </div>
        </div>
      </aside>

      <main className="container">{children}</main>
    </>
  );
}
