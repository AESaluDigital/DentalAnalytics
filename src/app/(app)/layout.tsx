import { can, requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import AppShell, { type NavItem } from "@/components/AppShell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  const all: (NavItem & { show: boolean })[] = [
    { href: "/dashboard", label: "Dashboard", icon: "◧", group: "Principal", show: can(user, "view_reports") },
    { href: "/reports", label: "Relatórios", icon: "▤", group: "Principal", show: can(user, "view_reports") },
    { href: "/", label: "Clientes", icon: "◉", group: "Clientes", show: can(user, "view_clients") },
    { href: "/clients/new", label: "Novo cliente", icon: "+", group: "Clientes", show: can(user, "manage_clients") },
    { href: "/settings/meta-ads", label: "Contas Meta Ads", icon: "ⓜ", group: "Configurações", show: can(user, "manage_integrations") },
    { href: "/settings/google-ads", label: "Contas Google Ads", icon: "Ⓖ", group: "Configurações", show: can(user, "manage_integrations") },
    { href: "/settings/integrations", label: "Integrações", icon: "⇄", group: "Configurações", show: can(user, "manage_integrations") },
    { href: "/settings/users", label: "Usuários e permissões", icon: "☺", group: "Configurações", show: user.master },
  ];
  const items = all.filter((i) => i.show).map(({ show: _show, ...i }) => i);
  const primary = items.filter((i) => i.href === "/dashboard" || i.href === "/reports");

  return (
    <AppShell
      user={{ name: user.name, email: user.email, master: user.master }}
      primary={primary}
      items={items}
      demo={env().DEMO_MODE === "true"}
    >
      {children}
    </AppShell>
  );
}
