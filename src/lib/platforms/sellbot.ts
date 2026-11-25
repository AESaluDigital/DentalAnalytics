import "server-only";
import { query, queryOne, ensureSchema } from "../db";
import { decryptSecret, encryptSecret } from "../crypto";
import { platformFromSource } from "../attribution";
import type { DateRange, SellbotData, SellbotEntry, SellbotPipelineData } from "../types";
import { PlatformError, fetchJson, num } from "./http";

/**
 * Sellbot (CRM) — API v1. Docs: https://next.sellbot.tech/ajuda/api
 * Autenticação: Authorization: Bearer sbt_… (token da conta, gerado em Configurações → API Tokens).
 * Uso aqui é SOMENTE LEITURA (GET /crm/pipelines e /crm/deals).
 *
 * Comportamento verificado na API:
 * - GET /crm/deals sem status traz só os abertos;
 * - com status=won|lost, date_from/date_to filtram pela data do fechamento (ganho/perda) — o site refiltra pela criação;
 * - limit aceita até 1000 por página.
 */
const BASE = "https://api.sellbot.tech/v1";
const PLATFORM = "Sellbot";
const PAGE = 1000;
const MAX_PAGES = 10;

interface Pipeline {
  pipeline_id: string;
  pipeline_name: string;
  pipeline_active?: boolean;
  pipeline_stages?: { stage_id: string; stage_name: string; stage_index?: number; stage_active?: boolean }[];
}

interface Deal {
  deal_id: string;
  deal_status: string;
  deal_value?: number | string | null;
  deal_stage_id?: string | null;
  deal_source_channel?: string | null;
  deal_date_added?: string | null;
  deal_date_won?: string | null;
  deal_date_closed?: string | null;
  deal_lost_reason?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_term?: string | null;
  utm_content?: string | null;
  lead_campaign?: string | null;
  meta_campaign_id?: string | null;
  meta_campaign_name?: string | null;
}

async function get<T>(token: string, path: string, params: Record<string, string | number> = {}): Promise<T> {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
  return fetchJson<T>(PLATFORM, `${BASE}${path}${qs ? `?${qs}` : ""}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    timeoutMs: 45_000,
  });
}

export async function sellbotPipelines(token: string): Promise<{ id: string; name: string }[]> {
  const res = await get<{ pipelines?: Pipeline[] }>(token, "/crm/pipelines");
  return (res.pipelines ?? [])
    .filter((p) => p.pipeline_active !== false)
    .map((p) => ({ id: p.pipeline_id, name: p.pipeline_name }));
}

async function stagesOf(token: string, pipelineId: string) {
  const res = await get<{ pipeline?: Pipeline }>(token, `/crm/pipelines/${encodeURIComponent(pipelineId)}`);
  return (res.pipeline?.pipeline_stages ?? [])
    .filter((s) => s.stage_active !== false)
    .sort((a, b) => num(a.stage_index) - num(b.stage_index))
    .map((s) => ({ id: s.stage_id, name: s.stage_name }));
}

async function deals(token: string, params: Record<string, string | number>): Promise<{ list: Deal[]; truncated: boolean }> {
  const list: Deal[] = [];
  let page = 1;
  let pages = 1;
  do {
    const res = await get<{ deals?: Deal[]; pages?: number }>(token, "/crm/deals", { ...params, limit: PAGE, page });
    list.push(...(res.deals ?? []));
    pages = num(res.pages) || 1;
    page++;
  } while (page <= pages && page <= MAX_PAGES);
  return { list, truncated: pages > MAX_PAGES };
}

const CHANNEL: Record<string, string> = {
  "sellbot-plugin": "Formulário do site",
  "sellbot-manual": "Cadastro manual",
  "sellbot-open": "Conversa (WhatsApp)",
  "meta-lead-ads": "Meta Lead Ads",
};

function sourceOf(d: Deal): string {
  if (d.utm_source) return d.utm_medium ? `${d.utm_source} / ${d.utm_medium}` : d.utm_source;
  if (d.meta_campaign_id || d.meta_campaign_name) return "Meta Lead Ads";
  const ch = d.deal_source_channel?.trim();
  if (ch) return CHANNEL[ch] ?? ch;
  return "Não identificada";
}

const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : "");
const inRange = (d: string, r: DateRange) => d >= r.start && d <= r.end;

/**
 * Tudo pela DATA DE CRIAÇÃO do negócio (entrada do lead no funil).
 * Ganhos/perdidos: a API filtra date_from/date_to pela data de fechamento; como o fechamento é sempre
 * depois da criação, buscamos os fechados desde o início do período anterior e filtramos pela criação aqui.
 */
async function pipelineData(
  token: string,
  p: { id: string; name: string },
  inGlobal: boolean,
  range: DateRange,
  prev: DateRange,
  notes: string[],
): Promise<SellbotPipelineData> {
  const today = new Date().toISOString().slice(0, 10);
  const closed = (status: string) => deals(token, { pipeline_id: p.id, status, date_from: prev.start, date_to: today });
  const [stages, won, lost, open] = await Promise.all([
    stagesOf(token, p.id).catch(() => [] as { id: string; name: string }[]),
    closed("won"),
    closed("lost"),
    deals(token, { pipeline_id: p.id, status: "open" }),
  ]);
  if ([won, lost, open].some((x) => x.truncated)) {
    notes.push(`Funil ${p.name}: muitos negócios; parte dos dados foi limitada a ${PAGE * MAX_PAGES} por consulta.`);
  }

  const all: { d: Deal; status: "won" | "lost" | "open" }[] = [
    ...won.list.map((d) => ({ d, status: "won" as const })),
    ...lost.list.map((d) => ({ d, status: "lost" as const })),
    ...open.list.map((d) => ({ d, status: "open" as const })),
  ];
  const created = (r: DateRange) => all.filter((x) => inRange(day(x.d.deal_date_added), r));
  const cur = created(range);
  const old = created(prev);

  const stageMap = new Map(stages.map((s) => [s.id, { ...s, count: 0, value: 0 }]));
  for (const { d, status } of cur) {
    if (status !== "open") continue;
    const st = d.deal_stage_id ? stageMap.get(d.deal_stage_id) : undefined;
    if (st) {
      st.count++;
      st.value += num(d.deal_value);
    }
  }

  const entryOf = ({ d, status }: { d: Deal; status: "won" | "lost" | "open" }): SellbotEntry => ({
      date: day(d.deal_date_added),
      status,
      value: num(d.deal_value),
      source: sourceOf(d),
      campaign: d.meta_campaign_name || d.utm_campaign || d.lead_campaign || null,
      metaCampaignId: d.meta_campaign_id || null,
      utm: {
        source: d.utm_source || null,
        medium: d.utm_medium || null,
        campaign: d.utm_campaign || null,
        term: d.utm_term || null,
        content: d.utm_content || null,
      },
      lostReason: status === "lost" ? d.deal_lost_reason?.trim() || "Sem motivo informado" : null,
  });
  const entries = cur.map(entryOf).sort((a, b) => a.date.localeCompare(b.date));

  const oldWon = old.filter((x) => x.status === "won");
  // Período anterior por plataforma (ROAS do Meta/Google pelas vendas do CRM): pela origem do lead;
  // as vendas sem origem identificada ficam somadas por campanha, para cruzar com as campanhas do relatório.
  const wonValueByPlatform = { meta: 0, google: 0 };
  const byCampaign = new Map<string, { metaCampaignId: string | null; campaign: string | null; value: number }>();
  for (const x of oldWon) {
    const e = entryOf(x);
    const pl = platformFromSource(e);
    if (pl) wonValueByPlatform[pl] += e.value;
    else if (e.metaCampaignId || e.campaign) {
      const k = `${e.metaCampaignId ?? ""}|${e.campaign ?? ""}`;
      const c = byCampaign.get(k) ?? { metaCampaignId: e.metaCampaignId, campaign: e.campaign, value: 0 };
      c.value += e.value;
      byCampaign.set(k, c);
    }
  }
  return {
    id: p.id,
    name: p.name,
    inGlobal,
    entries,
    prev: {
      created: old.length,
      won: oldWon.length,
      wonValue: oldWon.reduce((a, x) => a + num(x.d.deal_value), 0),
      lost: old.filter((x) => x.status === "lost").length,
      wonValueByPlatform,
      wonByCampaign: [...byCampaign.values()],
    },
    stages: [...stageMap.values()],
  };
}

/* ---------- Conexão por cliente ---------- */

export interface SellbotConnection {
  token: string;
  globalPipelines: string[] | null;
  connectedAt: Date;
}

export async function getSellbotConnection(clientId: number): Promise<SellbotConnection | null> {
  await ensureSchema();
  const row = await queryOne<{ token_encrypted: string; global_pipelines: string[] | null; connected_at: Date }>(
    "SELECT token_encrypted, global_pipelines, connected_at FROM sellbot_connections WHERE client_id = $1",
    [clientId],
  );
  if (!row) return null;
  try {
    return { token: decryptSecret(row.token_encrypted), globalPipelines: row.global_pipelines, connectedAt: row.connected_at };
  } catch {
    throw new PlatformError(PLATFORM, "Não foi possível ler o token salvo (INTEGRATIONS_KEY mudou?). Conecte de novo.");
  }
}

export async function saveSellbotConnection(clientId: number, token: string, userId: number): Promise<void> {
  await ensureSchema();
  await query(
    `INSERT INTO sellbot_connections (client_id, token_encrypted, global_pipelines, connected_by, connected_at)
     VALUES ($1, $2, NULL, $3, now())
     ON CONFLICT (client_id) DO UPDATE SET token_encrypted = EXCLUDED.token_encrypted,
       connected_by = EXCLUDED.connected_by, connected_at = now()`,
    [clientId, encryptSecret(token), userId],
  );
}

export async function setSellbotGlobalPipelines(clientId: number, ids: string[] | null): Promise<void> {
  await ensureSchema();
  // connected_at também muda para invalidar o cache do dashboard em todos os servidores.
  await query("UPDATE sellbot_connections SET global_pipelines = $1, connected_at = now() WHERE client_id = $2", [ids, clientId]);
}

export async function deleteSellbotConnection(clientId: number): Promise<void> {
  await ensureSchema();
  await query("DELETE FROM sellbot_connections WHERE client_id = $1", [clientId]);
}

/** Dados de vendas do cliente no período (null quando o cliente não tem Sellbot conectada). */
export async function fetchSellbotForClient(clientId: number, range: DateRange, prev: DateRange): Promise<SellbotData | null> {
  const conn = await getSellbotConnection(clientId);
  if (!conn) return null;
  const pipelines = await sellbotPipelines(conn.token);
  const notes: string[] = [];
  const data = await Promise.all(
    pipelines.map((p) =>
      pipelineData(conn.token, p, conn.globalPipelines === null || conn.globalPipelines.includes(p.id), range, prev, notes),
    ),
  );
  return { v: 2, pipelines: data, notes };
}

export async function hasSellbot(clientId: number): Promise<boolean> {
  await ensureSchema();
  return Boolean(await queryOne("SELECT 1 FROM sellbot_connections WHERE client_id = $1", [clientId]));
}

/** Conexões de todos os clientes (sem o token), para a tela "Contas Sellbot". */
export async function listSellbotConnections(): Promise<
  Map<number, { connectedAt: Date; globalPipelines: string[] | null; connectedBy: string | null }>
> {
  await ensureSchema();
  const rows = await query<{ client_id: number; connected_at: Date; global_pipelines: string[] | null; by: string | null }>(
    `SELECT s.client_id, s.connected_at, s.global_pipelines, u.name AS by
     FROM sellbot_connections s LEFT JOIN users u ON u.id = s.connected_by`,
  );
  return new Map(rows.map((r) => [r.client_id, { connectedAt: r.connected_at, globalPipelines: r.global_pipelines, connectedBy: r.by }]));
}

/** Marca da conexão (muda ao conectar/trocar/alterar funis) — usada na chave de cache do dashboard. */
export async function sellbotStamp(clientId: number): Promise<string> {
  await ensureSchema();
  const r = await queryOne<{ s: string }>(
    "SELECT connected_at::text || coalesce(array_to_string(global_pipelines, ','), '*') AS s FROM sellbot_connections WHERE client_id = $1",
    [clientId],
  );
  return r?.s ?? "-";
}
