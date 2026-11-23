import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { env } from "@/lib/env";
import { listIntegrations, type IntegrationInfo, type Provider } from "@/lib/integrations";
import { isConfigured, redirectUri } from "@/lib/oauth";
import {
  disconnectAction,
  importGoogleAdsAction,
  linkGoogleAdsAction,
  refreshAccountsAction,
  unlinkGoogleAdsAction,
} from "@/lib/actions/integrations";
import { query } from "@/lib/db";
import { ga4Properties, googleAdsAccounts, metaAdAccounts, type AccountOption, type Discovery } from "@/lib/platforms/discovery";

export const dynamic = "force-dynamic";
export const metadata = { title: "Integrações" };

const fmtDate = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

function StatusCard({
  provider,
  title,
  color,
  info,
  envFallback,
  description,
}: {
  provider: Provider;
  title: string;
  color: string;
  info: IntegrationInfo | undefined;
  envFallback: boolean;
  description: string;
}) {
  const cfg = isConfigured(provider);
  const daysLeft = info?.expires_at ? Math.floor((info.expires_at.getTime() - Date.now()) / 86_400_000) : null;
  const expired = daysLeft !== null && daysLeft < 0;

  return (
    <section className="card stack" style={{ gap: 14 }}>
      <div className="row between">
        <h2 className="section-title">
          <span className="swatch" style={{ background: color }} aria-hidden /> {title}
        </h2>
        {info && !expired ? (
          <span className="badge status-ok">✓ conectado</span>
        ) : envFallback ? (
          <span className="badge">usando token do .env</span>
        ) : (
          <span className="badge">não conectado</span>
        )}
      </div>
      <p className="ink-2" style={{ margin: 0 }}>{description}</p>

      {info && (
        <div className="table-wrap">
          <table>
            <tbody>
              <tr><th scope="row">Conta</th><td>{info.account_name}</td></tr>
              <tr><th scope="row">Conectado em</th><td>{fmtDate(info.connected_at)}{info.connected_by_name ? ` por ${info.connected_by_name}` : ""}</td></tr>
              <tr><th scope="row">Permissões</th><td className="name">{info.scopes.split(" ").filter((s) => !["openid", "email"].includes(s)).map((s) => s.replace("https://www.googleapis.com/auth/", "")).join(", ")}</td></tr>
              {info.expires_at && (
                <tr>
                  <th scope="row">Validade</th>
                  <td className={expired || (daysLeft ?? 99) <= 7 ? "error" : ""}>
                    {expired ? "expirado — reconecte" : `até ${fmtDate(info.expires_at)} (${daysLeft} dias)`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!cfg.ok && (
        <p className="error" style={{ margin: 0 }}>Falta configurar no .env: {cfg.missing.join(", ")}</p>
      )}

      <div className="row">
        {cfg.ok ? (
          // Link normal (não fetch): o navegador precisa ir até a Meta/Google para o login.
          <a className="btn primary" href={`/api/integrations/${provider}/start`}>
            {info ? "Reconectar" : `Conectar ${title}`}
          </a>
        ) : (
          <button className="btn primary" type="button" disabled>Conectar {title}</button>
        )}
        {info && (
          <form action={disconnectAction}>
            <input type="hidden" name="provider" value={provider} />
            <button className="btn danger" type="submit">Desconectar</button>
          </form>
        )}
      </div>
    </section>
  );
}

function AccountList({ title, result, empty }: { title: string; result: Discovery<AccountOption>; empty: string }) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      <h3 className="chart-title">{title}</h3>
      {!result.ok ? (
        <p className="muted small" style={{ margin: 0 }}>{result.error}</p>
      ) : result.items.length === 0 ? (
        <p className="muted small" style={{ margin: 0 }}>{empty}</p>
      ) : (
        <div className="table-wrap" style={{ maxHeight: 320, overflowY: "auto" }}>
          <table>
            <thead><tr><th>Nome</th><th>ID</th><th>Detalhe</th></tr></thead>
            <tbody>
              {result.items.map((a) => (
                <tr key={a.id}>
                  <td className="name">{a.name}</td>
                  <td><code>{a.id}</code></td>
                  <td className="muted">{a.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const fmtCustomerId = (id: string) => `${id.slice(0, 3)}-${id.slice(3, 6)}-${id.slice(6)}`;

async function GoogleAdsLinks({ mcc }: { mcc: string | undefined }) {
  const [list, clients] = await Promise.all([
    googleAdsAccounts(),
    query<{ id: number; name: string; google_ads_customer_id: string | null }>(
      "SELECT id, name, google_ads_customer_id FROM clients ORDER BY name",
    ),
  ]);
  if (!list.ok) return <p className="error" style={{ margin: 0 }}>{list.error}</p>;
  if (list.items.length === 0) return <p className="muted small" style={{ margin: 0 }}>Nenhuma conta encontrada no MCC.</p>;

  const byAccount = new Map(
    clients.filter((c) => c.google_ads_customer_id).map((c) => [c.google_ads_customer_id as string, c]),
  );
  const free = list.items.filter((a) => !byAccount.has(a.id)).length;

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row between">
        <p className="muted small" style={{ margin: 0 }}>
          {list.items.length} conta(s){mcc ? ` no MCC ${fmtCustomerId(mcc)}` : ""} · {list.items.length - free} vinculada(s) ·{" "}
          {free} sem cliente
        </p>
        {free > 0 && (
          <form action={importGoogleAdsAction}>
            <button className="btn" type="submit">Criar clientes para as {free} conta(s) sem vínculo</button>
          </form>
        )}
      </div>
      <div className="table-wrap" style={{ maxHeight: 520, overflowY: "auto" }}>
        <table>
          <thead>
            <tr><th>Conta Google Ads</th><th>ID</th><th>Cliente vinculado</th><th>Vincular a</th></tr>
          </thead>
          <tbody>
            {list.items.map((a) => {
              const linked = byAccount.get(a.id);
              return (
                <tr key={a.id}>
                  <td className="name">
                    {a.name}
                    {a.detail && <div className="muted small">{a.detail}</div>}
                  </td>
                  <td><code>{fmtCustomerId(a.id)}</code></td>
                  <td>
                    {linked ? (
                      <div className="row" style={{ gap: 8 }}>
                        <a href={`/clients/${linked.id}`}>{linked.name}</a>
                        <form action={unlinkGoogleAdsAction}>
                          <input type="hidden" name="customer_id" value={a.id} />
                          <button className="btn danger icon" type="submit">Desvincular</button>
                        </form>
                      </div>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    <form action={linkGoogleAdsAction} className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                      <input type="hidden" name="customer_id" value={a.id} />
                      <select name="client" defaultValue={linked ? String(linked.id) : "new"} aria-label={`Cliente para ${a.name}`}>
                        <option value="new">+ Novo cliente “{a.name.slice(0, 40)}”</option>
                        {clients.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                            {c.google_ads_customer_id && c.google_ads_customer_id !== a.id ? " (troca a conta atual)" : ""}
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

async function Accounts({ meta, google }: { meta: boolean; google: boolean }) {
  const [m, g, a] = await Promise.all([
    meta ? metaAdAccounts() : Promise.resolve<Discovery<AccountOption>>({ ok: false, error: "Conecte a Meta para listar." }),
    google ? googleAdsAccounts() : Promise.resolve<Discovery<AccountOption>>({ ok: false, error: "Conecte o Google para listar." }),
    google ? ga4Properties() : Promise.resolve<Discovery<AccountOption>>({ ok: false, error: "Conecte o Google para listar." }),
  ]);
  return (
    <div className="chart-grid">
      <AccountList title="Contas de anúncio Meta" result={m} empty="Nenhuma conta de anúncio acessível por esta conta." />
      <AccountList title="Contas Google Ads" result={g} empty="Nenhuma conta Google Ads acessível." />
      <AccountList title="Propriedades GA4" result={a} empty="Nenhuma propriedade GA4 acessível." />
    </div>
  );
}

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; msg?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const e = env();
  const list = await listIntegrations();
  const meta = list.find((i) => i.provider === "meta");
  const google = list.find((i) => i.provider === "google");
  const metaReady = Boolean(meta) || Boolean(e.META_ACCESS_TOKEN);
  const googleReady = Boolean(google) || Boolean(e.GOOGLE_REFRESH_TOKEN);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <span className="eyebrow">Configurações</span>
          <h1>Integrações</h1>
        </div>
      </div>

      {sp.ok && (
        <p className="notice ok" role="status">✓ {sp.ok === "meta" ? "Meta" : "Google"} conectado com sucesso.</p>
      )}
      {sp.msg && <p className="notice ok" role="status">✓ {sp.msg.slice(0, 300)}</p>}
      {sp.error && <p className="notice err" role="alert">⚠ {sp.error.slice(0, 300)}</p>}
      {e.DEMO_MODE === "true" && (
        <p className="notice" role="note">
          O app está em modo demonstração (DEMO_MODE=true): o dashboard e os relatórios usam dados fictícios mesmo com as
          contas conectadas. Mude para false no .env e reinicie o servidor para ver dados reais.
        </p>
      )}

      <div className="chart-grid">
        <StatusCard
          provider="meta"
          title="Meta"
          color="var(--series-1)"
          info={meta}
          envFallback={!meta && Boolean(e.META_ACCESS_TOKEN)}
          description="Entre com o perfil administrador do Business Manager. Permissão pedida: somente leitura de anúncios (ads_read)."
        />
        <StatusCard
          provider="google"
          title="Google"
          color="var(--series-2)"
          info={google}
          envFallback={!google && Boolean(e.GOOGLE_REFRESH_TOKEN)}
          description="Entre com a conta Google que acessa o MCC do Google Ads e as propriedades do GA4. Permissões: Google Ads e Analytics (leitura)."
        />
      </div>

      <section className="card stack" id="gads-link">
        <div>
          <h2 style={{ margin: 0 }}>Contas do MCC → clientes (Google Ads)</h2>
          <p className="muted small" style={{ margin: "4px 0 0" }}>
            Depois de conectar o Google com a conta que acessa o MCC, escolha a qual cliente cada conta pertence. O dashboard e os
            relatórios passam a puxar os dados dessa conta. Somente leitura: nada é alterado no Google Ads.
          </p>
        </div>
        {googleReady ? (
          <Suspense fallback={<div className="dash-loading" role="status">Buscando contas do MCC…</div>}>
            <GoogleAdsLinks mcc={e.GOOGLE_ADS_LOGIN_CUSTOMER_ID} />
          </Suspense>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            Clique em <strong>Conectar Google</strong> acima para listar as contas do MCC.
          </p>
        )}
      </section>

      <section className="card stack">
        <div className="row between">
          <h2>Contas disponíveis</h2>
          <form action={refreshAccountsAction}>
            <button className="btn" type="submit">Recarregar lista</button>
          </form>
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          Use estes IDs no cadastro dos clientes (o formulário também sugere as contas automaticamente). Lista guardada por 10 min.
        </p>
        <Suspense fallback={<div className="dash-loading" role="status">Buscando contas…</div>}>
          <Accounts meta={metaReady} google={googleReady} />
        </Suspense>
      </section>

      <section className="card stack">
        <h2>Configuração única (feita uma vez pelo TI)</h2>
        <ol className="setup-list">
          <li>
            <strong>Meta:</strong> em developers.facebook.com, use (ou crie) um app do tipo <em>Empresa</em> vinculado ao Business
            Manager da SuperDental, adicione o produto <em>Login do Facebook para Empresas</em> e cadastre a URI de redirecionamento:
            <code className="uri">{redirectUri("meta")}</code>
            Preencha <code>META_APP_ID</code> e <code>META_APP_SECRET</code> no .env (e <code>META_LOGIN_CONFIG_ID</code> se usar uma
            configuração do Login para Empresas). Quem for conectar precisa ser administrador/desenvolvedor do app.
          </li>
          <li>
            <strong>Google:</strong> no Google Cloud, ative Google Ads API, Analytics Data API e Analytics Admin API; crie um cliente
            OAuth do tipo <em>Aplicativo da Web</em> com a URI de redirecionamento:
            <code className="uri">{redirectUri("google")}</code>
            Preencha <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code>, <code>GOOGLE_ADS_DEVELOPER_TOKEN</code> e{" "}
            <code>GOOGLE_ADS_LOGIN_CUSTOMER_ID</code> (MCC).
          </li>
          <li>Reinicie o servidor e clique em <em>Conectar</em> em cada plataforma.</li>
        </ol>
      </section>
    </div>
  );
}
