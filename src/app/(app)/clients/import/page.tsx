import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { importSheetAction } from "@/lib/actions/import";
import { money } from "@/lib/format";
import { planImport, type PlannedRow } from "@/lib/import-plan";
import { PlatformError } from "@/lib/platforms/http";
import { googleAdsAccounts } from "@/lib/platforms/discovery";
import { readSheetClients } from "@/lib/sheet-import";

export const dynamic = "force-dynamic";
export const metadata = { title: "Importar clientes" };

const fmtId = (id: string) => `${id.slice(0, 3)}-${id.slice(3, 6)}-${id.slice(6)}`;

const ACTION_BADGE: Record<PlannedRow["action"], string> = {
  criar: "badge status-ok",
  atualizar: "badge gads",
  "sem mudança": "badge",
  conflito: "badge danger-badge",
  "duplicado na planilha": "badge",
};

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string; tab?: string; status?: string; ok?: string; error?: string }>;
}) {
  await requirePermission("manage_clients");
  const sp = await searchParams;
  const url = (sp.url ?? "").trim();
  const tab = sp.tab ?? "Google Ads";
  const status = sp.status ?? "ATIVO";

  let plan: PlannedRow[] | null = null;
  let readError: string | null = null;
  let mcc: Set<string> | null = null;
  if (url && !sp.ok) {
    try {
      plan = await planImport(await readSheetClients(url, tab, status));
      const accounts = await googleAdsAccounts();
      if (accounts.ok) mcc = new Set(accounts.items.map((a) => a.id));
    } catch (err) {
      readError = err instanceof PlatformError ? err.message : "Falha inesperada ao ler a planilha.";
    }
  }
  const count = (a: PlannedRow["action"]) => plan?.filter((r) => r.action === a).length ?? 0;
  const totalBudget = plan?.filter((r) => r.action === "criar" || r.action === "atualizar").reduce((t, r) => t + (r.budget ?? 0), 0) ?? 0;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <Link href="/" className="small back-link">← Clientes</Link>
          <h1>Importar clientes de planilha</h1>
          <p className="muted" style={{ maxWidth: "75ch" }}>
            Cria os clientes da planilha, vincula a conta do Google Ads pelo código e grava o investimento como orçamento do mês
            (Google Ads). Clientes já cadastrados são reconhecidos pelo código ou pelo nome e não são duplicados.
          </p>
        </div>
      </div>

      {sp.ok && <p className="notice ok" role="status">{sp.ok}</p>}
      {(sp.error || readError) && <p className="notice err" role="alert">{sp.error ?? readError}</p>}

      <form className="card grid-form" method="get">
        <label style={{ gridColumn: "1 / -1" }}>
          Link da planilha (Google Planilhas, compartilhada como &quot;qualquer pessoa com o link&quot;)
          <input type="text" name="url" defaultValue={url} required placeholder="https://docs.google.com/spreadsheets/d/…" />
        </label>
        <label>
          Aba
          <input type="text" name="tab" defaultValue={tab} required />
        </label>
        <label>
          Status a importar <span className="hint">deixe vazio para todos</span>
          <input type="text" name="status" defaultValue={status} />
        </label>
        <div className="form-actions">
          <button className="btn primary" type="submit">Ver prévia</button>
        </div>
      </form>

      {plan && (
        <section className="card stack">
          <div className="row between">
            <h2>Prévia — {plan.length} linha(s) com status &quot;{status || "qualquer"}&quot;</h2>
            <span className="muted small">
              {count("criar")} a criar · {count("atualizar")} a atualizar · {count("sem mudança")} sem mudança ·{" "}
              {count("conflito")} conflito(s) · orçamento do mês somado: {money(totalBudget)}
            </span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Conta Google Ads</th>
                  <th>No MCC?</th>
                  <th className="num">Orçamento do mês</th>
                  <th>O que acontece</th>
                </tr>
              </thead>
              <tbody>
                {plan.map((r, i) => (
                  <tr key={`${i}${r.name}`}>
                    <td className="name">
                      {r.name}
                      {r.existing && r.existing.name !== r.name && <span className="tree-count">cadastrado como &quot;{r.existing.name}&quot;</span>}
                    </td>
                    <td>{r.googleAdsId ? fmtId(r.googleAdsId) : <span className="error small">inválido</span>}</td>
                    <td>
                      {!r.googleAdsId || !mcc ? <span className="muted">—</span>
                        : mcc.has(r.googleAdsId) ? <span className="badge status-ok">sim</span>
                        : <span className="badge" title="A conta não aparece no MCC conectado; os dados só virão depois que ela for vinculada ao MCC.">não encontrada</span>}
                    </td>
                    <td className="num">
                      {r.budget === null ? <span className="muted">—</span> : money(r.budget)}
                      {r.budgetSource === "diário × dias" && <span className="tree-count">diário {r.daily} × dias do mês</span>}
                    </td>
                    <td>
                      <span className={ACTION_BADGE[r.action]}>{r.action}</span>
                      {r.note && <span className="tree-count">{r.note}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {mcc === null && (
            <p className="muted small" style={{ margin: 0 }}>
              Não foi possível consultar o MCC agora (Google não conectado?). A importação funciona mesmo assim.
            </p>
          )}
          <form action={importSheetAction} className="row">
            <input type="hidden" name="url" value={url} />
            <input type="hidden" name="tab" value={tab} />
            <input type="hidden" name="status" value={status} />
            <button className="btn primary" type="submit" disabled={!count("criar") && !count("atualizar")}>
              Importar {count("criar") + count("atualizar")} cliente(s)
            </button>
            <span className="muted small">Conflitos, duplicados e linhas sem mudança são ignorados.</span>
          </form>
        </section>
      )}
    </div>
  );
}
