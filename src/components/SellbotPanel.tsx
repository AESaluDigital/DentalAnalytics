import { connectSellbotAction, disconnectSellbotAction, saveSellbotPipelinesAction } from "@/lib/actions/sellbot";
import { PlatformError } from "@/lib/platforms/http";
import { getSellbotConnection, sellbotPipelines } from "@/lib/platforms/sellbot";

/** Conexão do cliente com a Sellbot (CRM de vendas): token, funis da visão Global e desconectar. */
export default async function SellbotPanel({ clientId, ok, error }: { clientId: number; ok?: string; error?: string }) {
  let conn: Awaited<ReturnType<typeof getSellbotConnection>> = null;
  let loadError: string | null = null;
  try {
    conn = await getSellbotConnection(clientId);
  } catch (err) {
    loadError = err instanceof PlatformError ? err.message : "Não foi possível ler a conexão.";
  }

  let pipelines: { id: string; name: string }[] = [];
  if (conn) {
    try {
      pipelines = await sellbotPipelines(conn.token);
    } catch (err) {
      loadError = `A Sellbot não respondeu: ${err instanceof PlatformError ? err.message : "falha de rede"}`;
    }
  }
  const inGlobal = (id: string) => !conn?.globalPipelines || conn.globalPipelines.includes(id);

  return (
    <section id="sellbot" className="card stack">
      <div className="card-head">
        <div>
          <h2 className="section-title"><span className="swatch" style={{ background: "#00A86B" }} aria-hidden /> Sellbot (vendas)</h2>
          <p className="muted small">
            Conecte o CRM do cliente para trazer as vendas (negócios ganhos), calcular o ROAS real e ver cada funil.
            Leitura apenas — nada é alterado na Sellbot.
          </p>
        </div>
        {conn ? <span className="badge status-ok">✓ conectada</span> : <span className="badge">não conectada</span>}
      </div>

      {ok && <p className="notice ok" role="status">{ok}</p>}
      {error && <p className="notice err" role="alert">{error}</p>}
      {loadError && <p className="notice err" role="alert">{loadError}</p>}

      {conn && pipelines.length > 0 && (
        <form action={saveSellbotPipelinesAction} className="stack" style={{ gap: 10 }}>
          <input type="hidden" name="clientId" value={clientId} />
          <span className="field-label">Funis somados na visão Global</span>
          <div className="perm-grid">
            {pipelines.map((p) => (
              <label key={p.id} className="perm">
                <input type="hidden" name="all" value={p.id} />
                <input type="checkbox" name="pipe" value={p.id} defaultChecked={inGlobal(p.id)} />
                <span><strong>{p.name}</strong></span>
              </label>
            ))}
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            Todos os funis continuam disponíveis para ver um a um no relatório. Desmarque funis que repetem a mesma venda
            (ex.: Pós-Venda) para a soma Global não contar duas vezes.
          </p>
          <div className="row">
            <button className="btn primary" type="submit">Salvar funis</button>
          </div>
        </form>
      )}

      <form action={connectSellbotAction} className="field-row">
        <input type="hidden" name="clientId" value={clientId} />
        <label>
          {conn ? "Trocar token da API" : "Token da API da Sellbot"}
          <input type="password" name="token" required placeholder="sbt_…" autoComplete="off" spellCheck={false} />
          <span className="hint">Na Sellbot: Configurações → API Tokens. Permissão mínima: leitura do CRM (crm:read).</span>
        </label>
        <div className="form-actions" style={{ alignSelf: "start", marginTop: 23 }}>
          <button className="btn primary" type="submit">{conn ? "Trocar e testar" : "Conectar e testar"}</button>
        </div>
      </form>

      {conn && (
        <form action={disconnectSellbotAction} className="row">
          <input type="hidden" name="clientId" value={clientId} />
          <span className="muted small">
            Conectada em {conn.connectedAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}.
          </span>
          <button className="btn danger" type="submit">Desconectar</button>
        </form>
      )}
    </section>
  );
}
