import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { logoutAction } from "@/lib/actions/auth";
import { env } from "@/lib/env";
import Logo from "@/components/Logo";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <>
      <header className="topbar">
        <div className="inner">
          <span className="row" style={{ gap: 12 }}>
            <Link href="/dashboard" className="brand" aria-label="SuperDental — início">
              <Logo variant="onDark" height={30} />
              <span className="brand-sub">Relatórios</span>
            </Link>
            {env().DEMO_MODE === "true" && <span className="badge">modo demonstração</span>}
          </span>
          <nav aria-label="Principal">
            <Link className="nav-link" href="/dashboard">Dashboard</Link>
            <Link className="nav-link" href="/">Clientes</Link>
            {user.role === "admin" && <Link className="nav-link" href="/clients/new">Novo cliente</Link>}
            {user.role === "admin" && <Link className="nav-link" href="/settings/integrations">Integrações</Link>}
            <span className="nav-user">{user.name}</span>
            <form action={logoutAction}>
              <button className="btn" type="submit">Sair</button>
            </form>
          </nav>
        </div>
      </header>
      <main className="container">{children}</main>
    </>
  );
}
