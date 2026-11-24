import Link from "next/link";
import { Suspense } from "react";
import { requirePermission } from "@/lib/auth";
import { env } from "@/lib/env";
import { query } from "@/lib/db";
import { listIntegrations } from "@/lib/integrations";
import { importMetaAction, linkMetaAction, refreshAccountsAction, unlinkMetaAction } from "@/lib/actions/integrations";
import { metaAdAccounts, type AccountOption } from "@/lib/platforms/discovery";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contas Meta Ads" };

type ClientLink = { id: number; name: string; meta_ad_account_id: string | null };

function Portfolio({
  name,
  groupId,
  accounts,
  clients,
  byAccount,
}: {
  name: string;
  groupId: string | undefined;
  accounts: AccountOption[];
  clients: ClientLink[];
  byAccount: Map<string, ClientLink>;
}) {
  const free = accounts.filter((a) => !byAccount.has(a.id)).length;
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row between">
        <div>
          <h3 className="chart-title" style={{ margin: 0 }}>{name}</h3>
          <p className="muted small" style={{ margin: "2px 0 0" }}>
            {groupId ? <>Portfólio <code>{groupId}</code> · </> : null}
            {accounts.length} conta(s) · {accounts.length - free} vinculada(s) · {free} sem cliente
          </p>
        </div>
        {free > 0 && (
          <form action={importMetaAction}>
            <input type="hidden" name="group" value={groupId ?? "none"} />
            <button className="btn" type="submit">Criar clientes para as {free} conta(s) sem vínculo</button>
          </form>
        )}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Conta de anúncio</th><th>ID</th><th>Cliente vinculado</th><th>Vincular a</th></tr>
          </thead>
          <tbody>
            {accounts.map((a) => {
              const linked = byAccount.get(a.id);
              return (
                <tr key={a.id}>
                  <td className="name">
                    {a.name}
                    {a.detail && <div className="muted small">{a.detail}</div>}
                  </td>
                  <td><code>act_{a.id}</code></td>
                  <td>
                    {linked ? (
                      <div className="row" style={{ gap: 8 }}>
                        <Link href={`/clients/${linked.id}`}>{linked.name}</Link>
                        <form action={unlinkMetaAction}>
                          <input type="hidden" name="account_id" value={a.id} />
                          <button className="btn danger icon" type="submit">Desvincular</button>
                        </form>
                      </div>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    <form action={linkMetaAction} className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                      <input type="hidden" name="account_id" value={a.id} />
                      <select name="client" defaultValue={linked ? String(linked.id) : "new"} aria-label={`Cliente para ${a.name}`}>
                        <option value="new">+ Novo cliente “{a.name.slice(0, 40)}”</option>
                        {clients.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                            {c.meta_ad_account_id && c.meta_ad_account_id !== a.id ? " (troca a conta atual)" : ""}
                          </option>
                        ))}
                      </select>
                      <button className="btn primary icon" type="submit">{linked ? "Trocar" : "Vincular"}</button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

async function MetaLinks() {
  const [list, clients] = await Promise.all([
    metaAdAccounts(),
    query<ClientLink>("SELECT id, name, meta_ad_account_id FROM clients ORDER BY name"),
  ]);
  if (!list.ok) return <p className="error" style={{ margin: 0 }}>{list.error}</p>;

  const byAccount = new Map(
    clients.filter((c) => c.meta_ad_account_id).map((c) => [c.meta_ad_account_id as string, c]),
  );
  const groups = new Map<string, { name: string; groupId?: string; accounts: AccountOption[] }>();
  for (const a of list.items) {
    const key = a.groupId ?? "none";
    if (!groups.has(key)) groups.set(key, { name: a.group ?? "Sem portfólio", groupId: a.groupId, accounts: [] });
    groups.get(key)!.accounts.push(a);
  }
  const free = list.items.filter((a) => !byAccount.has(a.id)).length;
  const portfolios = [...groups.values()].filter((g) => g.groupId).length;

  return (
    <div className="stack" style={{ gap: 20 }}>
      {list.notice && <p className="notice" role="note">{list.notice}</p>}
      <div className="row between">
        <p className="muted small" style={{ margin: 0 }}>
          {portfolios} portfólio(s) · {list.items.length} conta(s) · {list.items.length - free} vinculada(s) · {free} sem cliente
        </p>
        <div className="row">
          <form action={refreshAccountsAction}>
            <input type="hidden" name="back" value="/settings/meta-ads" />
            <button className="btn" type="submit">Recarregar lista</button>
          </form>
          {free > 0 && groups.size > 1 && (
            <form action={importMetaAction}>
              <button className="btn" type="submit">Criar clientes para todas as {free} sem vínculo</button>
            </form>
          )}
        </div>
      </div>
      {list.items.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>Nenhuma conta de anúncio acessível por este perfil.</p>
      ) : (
        [...groups.entries()].map(([key, g]) => (
          <Portfolio key={key} name={g.name} groupId={g.groupId} accounts={g.accounts} clients={clients} byAccount={byAccount} />
        ))
      )}
    </div>
  );
}

export default async function MetaAdsAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; error?: string }>;
}) {
  await requirePermission("manage_integrations");
  const sp = await searchParams;
  const e = env();
  const meta = (await listIntegrations()).find((i) => i.provider === "meta");
  const metaReady = Boolean(meta) || Boolean(e.META_ACCESS_TOKEN);
  const hasBusinessScope = meta ? meta.scopes.split(" ").includes("business_management") : true;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <span className="eyebrow">Configurações</span>
          <h1>Contas Meta Ads</h1>
        </div>
        <Link className="btn" href="/settings/integrations">Integrações</Link>
      </div>

      {sp.msg && <p className="notice ok" role="status">✓ {sp.msg.slice(0, 300)}</p>}
      {sp.error && <p className="notice err" role="alert">⚠ {sp.error.slice(0, 300)}</p>}
      {meta && !hasBusinessScope && (
        <p className="notice" role="note">
          A conexão atual só tem a permissão ads_read. Para listar todos os portfólios (Business Manager) e as contas
          compartilhadas com eles, <a href="/api/integrations/meta/start">reconecte a Meta</a> e aceite a permissão
          business_management.
        </p>
      )}

      <section className="card stack">
        <div>
          <h2 style={{ margin: 0 }}>Portfólios e contas de anúncio → clientes</h2>
          <p className="muted small" style={{ margin: "4px 0 0" }}>
            {meta ? `Conectado como ${meta.account_name}. ` : ""}
            Contas dos portfólios (Business Manager) que o seu perfil gerencia — próprias e compartilhadas por clientes.
            Escolha a qual cliente cada conta pertence; o dashboard e os relatórios passam a puxar os dados dela.
            Somente leitura: nada é alterado na Meta.
          </p>
        </div>
        {metaReady ? (
          <Suspense fallback={<div className="dash-loading" role="status">Buscando portfólios e contas da Meta…</div>}>
            <MetaLinks />
          </Suspense>
        ) : (
          <div className="stack" style={{ gap: 10 }}>
            <p className="muted" style={{ margin: 0 }}>
              Primeiro conecte a Meta com o perfil que administra os portfólios (somente leitura).
            </p>
            <div className="row">
              <Link className="btn primary" href="/settings/integrations">Conectar Meta em Integrações</Link>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
