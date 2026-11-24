import "server-only";
import { query, queryOne, ensureSchema } from "../db";
import { decryptSecret, encryptSecret } from "../crypto";
import type { DateRange, SellbotData, SellbotPipelineData, SellbotSale } from "../types";
import { PlatformError, fetchJson, num } from "./http";

/**
 * Sellbot (CRM) — API v1. Docs: https://next.sellbot.tech/ajuda/api
 * Autenticação: Authorization: Bearer sbt_… (token da conta, gerado em Configurações → API Tokens).
 * Uso aqui é SOMENTE LEITURA (GET /crm/pipelines e /crm/deals).
 *
 * Comportamento verificado na API:
 * - GET /crm/deals sem status traz só os abertos;
 * - com status=won|lost, date_from/date_to filtram pela data do fechamento (ganho/perda);
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
  deal_date_won?: string | null;
  deal_date_closed?: string | null;
  deal_lost_reason?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
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
const sum = (l: Deal[]) => l.reduce((a, d) => a + num(d.deal_value), 0);

async function pipelineData(
  token: string,
  p: { id: string; name: string },
  inGlobal: boolean,
  range: DateRange,
  prev: DateRange,
  notes: string[],
): Promise<SellbotPipelineData> {
  const by = (status: string, r: DateRange) => deals(token, { pipeline_id: p.id, status, date_from: r.start, date_to: r.end });
  const [stages, won, wonPrev, lost, lostPrev, open] = await Promise.all([
    stagesOf(token, p.id).catch(() => [] as { id: string; name: string }[]),
    by("won", range),
    by("won", prev),
    by("lost", range),
    by("lost", prev),
    deals(token, { pipeline_id: p.id, status: "open" }),
  ]);
  if ([won, wonPrev, lost, lostPrev, open].some((x) => x.truncated)) {
    notes.push(`Funil ${p.name}: muitos negócios; parte dos dados foi limitada a ${PAGE * MAX_PAGES} por consulta.`);
  }

  const stageMap = new Map(stages.map((s) => [s.id, { ...s, count: 0, value: 0 }]));
  for (const d of open.list) {
    const s = d.deal_stage_id ? stageMap.get(d.deal_stage_id) : undefined;
    if (s) {
      s.count++;
      s.value += num(d.deal_value);
    }
  }

  const reasons = new Map<string, number>();
  for (const d of lost.list) {
    const r = d.deal_lost_reason?.trim() || "Sem motivo informado";
    reasons.set(r, (reasons.get(r) ?? 0) + 1);
  }

  const sales: SellbotSale[] = won.list
    .map((d) => ({
      date: day(d.deal_date_won ?? d.deal_date_closed),
      value: num(d.deal_value),
      pipelineId: p.id,
      source: sourceOf(d),
      campaign: d.meta_campaign_name || d.utm_campaign || d.lead_campaign || null,
      metaCampaignId: d.meta_campaign_id || null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    id: p.id,
    name: p.name,
    inGlobal,
    won: { count: won.list.length, value: sum(won.list) },
    wonPrev: { count: wonPrev.list.length, value: sum(wonPrev.list) },
    lost: { count: lost.list.length, value: sum(lost.list) },
    lostPrev: { count: lostPrev.list.length },
    open: { count: open.list.length, value: sum(open.list) },
    stages: [...stageMap.values()],
    sales,
    lostReasons: [...reasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
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
  await query("UPDATE sellbot_connections SET global_pipelines = $1 WHERE client_id = $2", [ids, clientId]);
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
  return { pipelines: data, notes };
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
