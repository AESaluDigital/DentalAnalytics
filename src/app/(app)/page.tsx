import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import type { ClientRow } from "@/lib/types";

interface Row extends ClientRow {
  last_report: Date | null;
}

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string; all?: string }> }) {
  const user = await requireUser();
  const { q = "", all } = await searchParams;
  const term = q.trim().slice(0, 100);
  const showInactive = all === "1";

  const clients = await query<Row>(
    `SELECT c.id, c.name, c.meta_ad_account_id, c.meta_conversion_action, c.google_ads_customer_id,
            c.ga4_property_id, c.active, max(r.created_at) AS last_report
     FROM clients c LEFT JOIN reports r ON r.client_id = c.id
     WHERE ($1 = '' OR c.name ILIKE '%' || $1 || '%') AND ($2 OR c.active)
     GROUP BY c.id ORDER BY lower(c.name)`,
    [term, showInactive],
  );

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <span className="eyebrow">Carteira</span>
          <h1>Clientes</h1>
        </div>
        {user.role === "admin" && <Link className="btn primary" href="/clients/new">+ Novo cliente</Link>}
      </div>

      <form className="card row" role="search" style={{ padding: 14 }}>
        <input type="search" name="q" defaultValue={term} placeholder="Buscar cliente pelo nome…" aria-label="Buscar cliente"
          style={{ flex: "1 1 260px" }} />
        <label className="checkbox">
          <input type="checkbox" name="all" value="1" defaultChecked={showInactive} /> Incluir inativos
        </label>
        <button className="btn" type="submit">Filtrar</button>
      </form>

      {clients.length === 0 ? (
        <p className="muted">Nenhum cliente encontrado.</p>
      ) : (
        <div className="client-list">
          {clients.map((c) => (
            <Link key={c.id} href={`/clients/${c.id}`} className="card client-card">
              <div className="row" style={{ flexWrap: "nowrap" }}>
                <span className="client-avatar" aria-hidden>{c.name.trim().charAt(0).toUpperCase()}</span>
                <strong style={{ flex: 1, minWidth: 0 }}>{c.name}</strong>
                {!c.active && <span className="badge">inativo</span>}
              </div>
              <div className="row" style={{ gap: 6 }}>
                {c.meta_ad_account_id && <span className="badge meta">Meta Ads</span>}
                {c.google_ads_customer_id && <span className="badge gads">Google Ads</span>}
                {c.ga4_property_id && <span className="badge ga4">GA4</span>}
                {!c.meta_ad_account_id && !c.google_ads_customer_id && !c.ga4_property_id && (
                  <span className="badge">sem contas vinculadas</span>
                )}
              </div>
              <span className="muted small">
                {c.last_report
                  ? `Último relatório: ${c.last_report.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`
                  : "Sem relatórios"}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
