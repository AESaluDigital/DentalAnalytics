import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { env } from "@/lib/env";
import { query } from "@/lib/db";
import { listIntegrations } from "@/lib/integrations";
import {
  importGoogleAdsAction,
  linkGoogleAdsAction,
  refreshAccountsAction,
  unlinkGoogleAdsAction,
} from "@/lib/actions/integrations";
import { googleAdsAccounts } from "@/lib/platforms/discovery";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contas Google Ads" };

const fmtCustomerId = (id: string) => `${id.slice(0, 3)}-${id.slice(3, 6)}-${id.slice(6)}`;

async function GoogleAdsLinks({ mcc }: { mcc: string | undefined }) {
  const [list, clients] = await Promise.all([
    googleAdsAccounts(),
    query<{ id: number; name: string; google_ads_customer_id: string | null }>(
      "SELECT id, name, google_ads_customer_id FROM clients ORDER BY name",
    ),
  ]);
  if (!list.ok) return <p className="error" style={{ margin: 0 }}>{list.error}</p>;
  if (list.items.length === 0) return <p className="muted" style={{ margin: 0 }}>Nenhuma conta encontrada no MCC.</p>;

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
        <div className="row">
          <form action={refreshAccountsAction}>
            <input type="hidden" name="back" value="/settings/google-ads" />
            <button className="btn" type="submit">Recarregar lista</button>
          </form>
          {free > 0 && (
            <form action={importGoogleAdsAction}>
              <button className="btn" type="submit">Criar clientes para as {free} conta(s) sem vínculo</button>
            </form>
          )}
        </div>
      </div>
      <div className="table-wrap">
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
                        <Link href={`/clients/${linked.id}`}>{linked.name}</Link>
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

export default async function GoogleAdsAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; error?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const e = env();
  const google = (await listIntegrations()).find((i) => i.provider === "google");
  const googleReady = Boolean(google) || Boolean(e.GOOGLE_REFRESH_TOKEN);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <span className="eyebrow">Configurações</span>
          <h1>Contas Google Ads</h1>
        </div>
        <Link className="btn" href="/settings/integrations">Integrações</Link>
      </div>

      {sp.msg && <p className="notice ok" role="status">✓ {sp.msg.slice(0, 300)}</p>}
      {sp.error && <p className="notice err" role="alert">⚠ {sp.error.slice(0, 300)}</p>}

      <section className="card stack">
        <div>
          <h2 style={{ margin: 0 }}>Contas do MCC → clientes</h2>
          <p className="muted small" style={{ margin: "4px 0 0" }}>
            {google ? `Conectado como ${google.account_name}. ` : ""}
            Escolha a qual cliente cada conta pertence. O dashboard e os relatórios passam a puxar os dados dessa conta.
            Somente leitura: nada é alterado no Google Ads.
          </p>
        </div>
        {googleReady ? (
          <Suspense fallback={<div className="dash-loading" role="status">Buscando contas do MCC…</div>}>
            <GoogleAdsLinks mcc={e.GOOGLE_ADS_LOGIN_CUSTOMER_ID} />
          </Suspense>
        ) : (
          <div className="stack" style={{ gap: 10 }}>
            <p className="muted" style={{ margin: 0 }}>
              Primeiro conecte o Google com a conta que acessa o MCC (somente leitura).
            </p>
            <div className="row">
              <Link className="btn primary" href="/settings/integrations">Conectar Google em Integrações</Link>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
