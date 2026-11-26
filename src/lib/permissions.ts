/** Permissões individuais de cada usuário (usadas no servidor e nas telas). */

export const PERMISSIONS = [
  { key: "view_overview", label: "Ver visão geral", desc: "Lista de todos os clientes com métricas básicas e pontos de atenção (com comentários). Tela inicial após o login." },
  { key: "view_clients", label: "Ver clientes", desc: "Lista de clientes e contas vinculadas." },
  { key: "view_reports", label: "Ver dashboard e relatórios", desc: "Dashboard ao vivo e relatórios salvos." },
  { key: "view_leads", label: "Ver leads", desc: "Lista de leads com nome, telefone, e-mail e UTMs (dados pessoais — LGPD)." },
  { key: "export_reports", label: "Gerar e exportar relatórios", desc: "Gerar relatório, exportar PDF e links de compartilhamento." },
  { key: "manage_clients", label: "Cadastrar e editar clientes", desc: "Criar clientes e vincular contas de anúncio." },
  { key: "manage_integrations", label: "Integrações e contas de anúncio", desc: "Conectar Meta/Google e vincular contas dos portfólios/MCC." },
] as const;

export type Permission = (typeof PERMISSIONS)[number]["key"];

export const ALL_PERMISSIONS: Permission[] = PERMISSIONS.map((p) => p.key);

/** Todo usuário novo começa com estas permissões. */
export const DEFAULT_PERMISSIONS: Permission[] = ["view_overview", "view_clients", "view_reports", "export_reports"];

export function isPermission(v: string): v is Permission {
  return (ALL_PERMISSIONS as string[]).includes(v);
}
