import Link from "next/link";
import { redirect } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { env } from "@/lib/env";
import { connectSellbotAction, disconnectSellbotAction } from "@/lib/actions/sellbot";
import { listSellbotConnections } from "@/lib/platforms/sellbot";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contas Sellbot" };

const fmtDate = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

export default async function SellbotAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ sellbot_ok?: string; sellbot_error?: string; c?: string; q?: string }>;
}) {
  const user = await requireUser();
  if (!can(user, "manage_clients") && !can(user, "manage_integrations")) redirect("/");
  const sp = await searchParams;
  const term = (sp.q ?? "").trim().slice(0, 100);

  const [clients, conns] = await Promise.all([
    query<{ id: number; name: string; active: boolean }>(
      `SELECT id, name, active FROM clients WHERE ($1 = '' OR name ILIKE '%' || $1 || '%') ORDER BY active DESC, lower(name)`,
      [term],
    ),
    listSellbotConnections(),
  ]);
  const connected = clients.filter((c) => conns.has(c.id)).length;
  const keyMissing = !env().INTEGRATIONS_KEY;
  const focus = Number(sp.c);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <span className="eyebrow">Configurações</span>
          <h1>Contas Sellbot</h1>
          <p className="muted" style={{ maxWidth: "75ch" }}>
            Conecte a conta da Sellbot (CRM) de cada cliente para trazer as vendas, o funil e o ROAS real para o dashboard e os
            relatórios. A conexão é feita por <strong>token da API</strong> — a Sellbot não permite entrar com e-mail e senha por
            integração.
          </p>
        </div>
      </div>

      <section className="card stack" style={{ gap: 10 }}>
        <h2>Como gerar o token de cada cliente</h2>
        <ol className="setup-list">
          <li>Entre na Sellbot com a conta do cliente (<a href="https://next.sellbot.tech/login" target="_blank" rel="noreferrer">next.sellbot.tech</a>).</li>
          <li>Abra <strong>Configurações → API Tokens</strong> e crie um token do tipo <strong>conta inteira</strong>, com permissão de leitura do CRM (<code>crm:read</code>).</li>
          <li>Copie o token (começa com <code>sbt_</code>) — ele só aparece uma vez — e cole na linha do cliente abaixo.</li>
        </ol>
      </section>

      {keyMissing && (
        <p className="notice err" role="alert">
          Falta configurar <code>INTEGRATIONS_KEY</code> no servidor (variáveis de ambiente). Sem ela os tokens não podem ser salvos.
        </p>
      )}
      {sp.sellbot_ok && <p className="notice ok" role="status">{sp.sellbot_ok}</p>}
      {sp.sellbot_error && <p className="notice err" role="alert">{sp.sellbot_error}</p>}

      <form className="card row" role="search" style={{ padding: 14 }}>
        <input type="search" name="q" defaultValue={term} placeholder="Buscar cliente…" aria-label="Buscar cliente" />
        <button className="btn" type="submit">Filtrar</button>
        <span className="muted small">{connected} de {clients.length} cliente(s) conectados</span>
      </form>

      <div className="card">
        <div className="table-wrap">
          <table className="sellbot-table">
            <thead>
              <tr><th>Cliente</th><th>Sellbot</th><th>Token da API</th><th /></tr>
            </thead>
            <tbody>
              {clients.map((c) => {
                const conn = conns.get(c.id);
                return (
                  <tr key={c.id} id={`c${c.id}`} className={c.id === focus ? "row-focus" : undefined}>
                    <td className="name">
                      <Link href={`/clients/${c.id}`}>{c.name}</Link>
                      {!c.active && <span className="tree-count">inativo</span>}
                    </td>
                    <td>
                      {conn ? (
                        <>
                          <span className="badge status-ok">✓ conectada</span>
                          <span className="tree-count">
                            desde {fmtDate(conn.connectedAt)}{conn.connectedBy ? ` · ${conn.connectedBy}` : ""}
                            {conn.globalPipelines ? ` · Global: ${conn.globalPipelines.length} funil(is)` : " · Global: todos os funis"}
                          </span>
                        </>
                      ) : (
                        <span className="badge">não conectada</span>
                      )}
                    </td>
                    <td>
                      <form action={connectSellbotAction} className="row token-form">
                        <input type="hidden" name="clientId" value={c.id} />
                        <input type="hidden" name="back" value="/settings/sellbot" />
                        <input type="password" name="token" required placeholder={conn ? "Novo token sbt_…" : "sbt_…"}
                          autoComplete="off" spellCheck={false} aria-label={`Token da Sellbot de ${c.name}`} />
                        <button className="btn primary" type="submit" disabled={keyMissing}>{conn ? "Trocar" : "Conectar"}</button>
                      </form>
                    </td>
                    <td className="actions">
                      {conn && (
                        <div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                          <Link className="btn small-btn" href={`/clients/${c.id}/edit#sellbot`}>Funis</Link>
                          <form action={disconnectSellbotAction}>
                            <input type="hidden" name="clientId" value={c.id} />
                            <input type="hidden" name="back" value="/settings/sellbot" />
                            <button className="btn small-btn danger" type="submit">Desconectar</button>
                          </form>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {clients.length === 0 && <p className="muted">Nenhum cliente encontrado.</p>}
        </div>
      </div>
    </div>
  );
}
