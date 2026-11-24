import { requireMaster, effectivePermissions, isMasterLogin } from "@/lib/auth";
import { query } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";
import {
  approveUserAction,
  createUserAction,
  rejectUserAction,
  resetDefaultsAction,
  resetPasswordAction,
  savePermissionsAction,
  setActiveAction,
} from "@/lib/actions/users";

export const dynamic = "force-dynamic";
export const metadata = { title: "Usuários" };

interface Row {
  id: number;
  email: string;
  name: string;
  role: "admin" | "user";
  permissions: string[] | null;
  active: boolean;
  pending: boolean;
  created_at: Date;
}

const fmtDate = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const me = await requireMaster();
  const sp = await searchParams;
  const users = await query<Row>(
    `SELECT id, email, name, role, permissions, active, pending, created_at FROM users
     ORDER BY pending DESC, active DESC, lower(name)`,
  );
  const pending = users.filter((u) => u.pending);
  const others = users.filter((u) => !u.pending);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <span className="eyebrow">Acesso</span>
          <h1>Usuários e permissões</h1>
          <p className="muted" style={{ margin: "6px 0 0", maxWidth: "70ch" }}>
            Só as contas master podem criar usuários e alterar permissões. Todo usuário novo começa com: ver clientes,
            ver dashboard/relatórios e gerar/exportar relatórios.
          </p>
        </div>
      </div>

      {sp.ok && <p className="notice ok" role="status">{sp.ok}</p>}
      {sp.error && <p className="notice err" role="alert">{sp.error}</p>}

      {pending.length > 0 && (
        <section className="card stack">
          <h2>Aguardando aprovação <span className="badge">{pending.length}</span></h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Nome</th><th>Usuário/e-mail</th><th>Cadastrado em</th><th /></tr></thead>
              <tbody>
                {pending.map((u) => (
                  <tr key={u.id}>
                    <td className="name">{u.name}</td>
                    <td>{u.email}</td>
                    <td>{fmtDate(u.created_at)}</td>
                    <td>
                      <div className="row" style={{ justifyContent: "flex-end" }}>
                        <form action={approveUserAction}>
                          <input type="hidden" name="id" value={u.id} />
                          <button className="btn primary" type="submit">Aprovar</button>
                        </form>
                        <form action={rejectUserAction}>
                          <input type="hidden" name="id" value={u.id} />
                          <button className="btn danger" type="submit">Recusar</button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card stack">
        <h2>Criar usuário</h2>
        <form action={createUserAction} className="grid-form">
          <label>Nome<input type="text" name="name" required maxLength={120} /></label>
          <label>
            Usuário ou e-mail
            <input type="text" name="login" required autoCapitalize="none" spellCheck={false} maxLength={200} />
          </label>
          <label>
            Senha inicial <span className="hint">mín. 8 caracteres</span>
            <input type="password" name="password" required minLength={8} autoComplete="new-password" />
          </label>
          <div className="row" style={{ alignItems: "flex-end" }}>
            <button className="btn primary" type="submit">Criar com permissões padrão</button>
          </div>
        </form>
      </section>

      <section className="stack">
        {others.map((u) => {
          const master = isMasterLogin(u.email);
          const perms = new Set<string>(effectivePermissions(u));
          return (
            <article key={u.id} className={`card stack user-card${u.active ? "" : " inactive"}`}>
              <div className="row between">
                <div className="row">
                  <span className="client-avatar" aria-hidden>{u.name.trim().charAt(0).toUpperCase()}</span>
                  <div>
                    <strong className="user-name">{u.name}</strong>
                    <div className="muted small">{u.email}{u.id === me.id ? " · você" : ""}</div>
                  </div>
                </div>
                <div className="row">
                  {master && <span className="badge master">master · acesso total</span>}
                  {!u.active && <span className="badge">inativo</span>}
                  {!u.permissions && !master && <span className="badge">padrão do papel ({u.role})</span>}
                </div>
              </div>

              {master ? (
                <p className="muted small" style={{ margin: 0 }}>
                  Contas master (MASTER_ADMINS) têm todas as permissões e gerenciam os demais usuários.
                </p>
              ) : (
                <>
                  <form action={savePermissionsAction} className="stack">
                    <input type="hidden" name="id" value={u.id} />
                    <fieldset className="perm-grid">
                      <legend className="sr-only">Permissões de {u.name}</legend>
                      {PERMISSIONS.map((p) => (
                        <label key={p.key} className="perm">
                          <input type="checkbox" name="perm" value={p.key} defaultChecked={perms.has(p.key)} />
                          <span>
                            <strong>{p.label}</strong>
                            <span className="muted small">{p.desc}</span>
                          </span>
                        </label>
                      ))}
                    </fieldset>
                    <div className="row">
                      <button className="btn primary" type="submit">Salvar permissões</button>
                    </div>
                  </form>
                  <div className="row user-actions">
                    <form action={resetDefaultsAction}>
                      <input type="hidden" name="id" value={u.id} />
                      <button className="btn" type="submit">Voltar ao padrão</button>
                    </form>
                    <form action={setActiveAction}>
                      <input type="hidden" name="id" value={u.id} />
                      <input type="hidden" name="active" value={u.active ? "0" : "1"} />
                      <button className={`btn${u.active ? " danger" : ""}`} type="submit">
                        {u.active ? "Desativar" : "Reativar"}
                      </button>
                    </form>
                    <form action={resetPasswordAction} className="row">
                      <input type="hidden" name="id" value={u.id} />
                      <input type="password" name="password" placeholder="Nova senha (mín. 8)" minLength={8} required
                        autoComplete="new-password" aria-label={`Nova senha de ${u.name}`} />
                      <button className="btn" type="submit">Redefinir senha</button>
                    </form>
                  </div>
                </>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}
