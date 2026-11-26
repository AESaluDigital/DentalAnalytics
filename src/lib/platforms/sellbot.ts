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
  meta_adset_name?: string | null;
  meta_ad_name?: string | null;
  meta_form_name?: string | null;
  lead_id?: string | null;
  lead_name?: string | null;
  lead_phone?: string | null;
  deal_owner_name?: string | null;
  deal_tags?: string[] | null;
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
  "facebook-leads-form": "Formulário da Meta",
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

/* ---------- Leads (tela Leads) ---------- */

export interface SellbotLead {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  owner: string | null;
  tags: string[];
  isCustomer: boolean;
  dateAdded: string | null;
  dateUpdated: string | null;
  channel: string | null;
  origin: string | null;
  campaign: string | null;
  utm: { source: string | null; medium: string | null; campaign: string | null; content: string | null; term: string | null };
  meta: { campaign: string | null; adset: string | null; ad: string | null; form: string | null };
  city: string | null;
  state: string | null;
  /** O detalhe (UTMs etc.) não pôde ser lido; só os dados da listagem. */
  partial: boolean;
  /** Negócio do lead no CRM (filtro por período): funil, etapa e situação. */
  deal: { pipeline: string; stage: string | null; status: "open" | "won" | "lost" } | null;
}

type Str = string | null | undefined;
interface LeadListItem {
  id: string;
  first_name?: Str;
  last_name?: Str;
  phone?: Str;
  email?: Str;
  tags?: string[] | null;
  is_customer?: boolean | null;
  lead_owner_name?: Str;
  date_updated?: Str;
  channel?: Str;
  campaign?: Str;
}
interface LeadDetail extends LeadListItem {
  date_added?: Str;
  acquisition_channel?: Str;
  origin?: Str;
  utm_source?: Str;
  utm_medium?: Str;
  utm_campaign?: Str;
  utm_content?: Str;
  utm_term?: Str;
  meta_campaign?: Str;
  meta_campaign_name?: Str;
  meta_adset_name?: Str;
  meta_ad_name?: Str;
  meta_form_name?: Str;
  city?: Str;
  state?: Str;
}

const clean = (v: Str) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Detalhes já lidos (o lead muda pouco): evita repetir a chamada ao trocar de página ou atualizar. */
const detailCache = new Map<string, { at: number; lead: LeadDetail }>();
const DETAIL_TTL = 10 * 60_000;

async function leadDetail(token: string, id: string): Promise<LeadDetail | null> {
  const key = `${token.slice(-8)}:${id}`;
  const hit = detailCache.get(key);
  if (hit && Date.now() - hit.at < DETAIL_TTL) return hit.lead;
  try {
    const res = await get<{ lead?: LeadDetail }>(token, `/contacts/leads/${encodeURIComponent(id)}`);
    if (!res.lead) return null;
    if (detailCache.size > 5000) detailCache.clear();
    detailCache.set(key, { at: Date.now(), lead: res.lead });
    return res.lead;
  } catch {
    return null;
  }
}

function toLead(item: LeadListItem, d: LeadDetail | null): SellbotLead {
  const x: LeadDetail = { ...item, ...(d ?? {}) };
  const ch = clean(x.acquisition_channel) ?? clean(x.channel);
  return {
    id: item.id,
    name: [clean(x.first_name), clean(x.last_name)].filter(Boolean).join(" ") || "(sem nome)",
    phone: clean(x.phone),
    email: clean(x.email),
    owner: clean(x.lead_owner_name),
    tags: x.tags ?? [],
    isCustomer: Boolean(x.is_customer),
    dateAdded: clean(x.date_added),
    dateUpdated: clean(x.date_updated),
    channel: ch ? CHANNEL[ch] ?? ch : null,
    origin: clean(x.origin),
    campaign: clean(x.campaign),
    utm: {
      source: clean(x.utm_source),
      medium: clean(x.utm_medium),
      campaign: clean(x.utm_campaign),
      content: clean(x.utm_content),
      term: clean(x.utm_term),
    },
    meta: {
      campaign: clean(x.meta_campaign_name) ?? clean(x.meta_campaign),
      adset: clean(x.meta_adset_name),
      ad: clean(x.meta_ad_name),
      form: clean(x.meta_form_name),
    },
    city: clean(x.city),
    state: clean(x.state),
    partial: d === null,
    deal: null,
  };
}

/**
 * Uma página de leads do cliente na Sellbot (GET /contacts/leads), completada com o detalhe de cada lead
 * (GET /contacts/leads/{id}), que é onde estão UTMs, origem Meta e data de entrada.
 * Sem filtro de período: date_from/date_to da listagem não filtram pela data de entrada (verificado na API);
 * a listagem já vem dos mais recentes para os mais antigos.
 */
export async function fetchSellbotLeads(
  clientId: number,
  opts: { page: number; limit: number; search?: string },
): Promise<{ leads: SellbotLead[]; total: number; pages: number } | null> {
  const conn = await getSellbotConnection(clientId);
  if (!conn) return null;
  const params: Record<string, string | number> = { page: opts.page, limit: opts.limit };
  if (opts.search) params.s = opts.search;
  const res = await get<{ leads?: LeadListItem[]; total?: number; pages?: number }>(conn.token, "/contacts/leads", params);
  const items = res.leads ?? [];
  const details = await Promise.all(items.map((i) => leadDetail(conn.token, i.id)));
  const byDate = (l: SellbotLead) => l.dateAdded ?? l.dateUpdated ?? "";
  return {
    leads: items.map((i, n) => toLead(i, details[n])).sort((a, b) => byDate(b).localeCompare(byDate(a))),
    total: num(res.total),
    pages: Math.max(num(res.pages), 1),
  };
}

/* ---------- Leads por período (pela entrada no CRM) ---------- */

interface PeriodRow {
  leadId: string;
  deal: Deal;
  pipeline: string;
  stage: string | null;
  status: "open" | "won" | "lost";
}

/** Lista do período já montada: trocar de página não refaz a consulta. */
const periodCache = new Map<string, { at: number; rows: PeriodRow[] }>();
const PERIOD_TTL = 5 * 60_000;

/**
 * Leads que entraram no CRM no período. A listagem de leads da Sellbot não filtra pela data de entrada,
 * então a base são os negócios (GET /crm/deals), criados quando o lead entra no funil: abertos + ganhos/perdidos
 * fechados desde o início do período, filtrados pela data de criação. Um lead com vários negócios aparece uma vez.
 */
async function periodRows(clientId: number, token: string, range: DateRange): Promise<PeriodRow[]> {
  const key = `${clientId}|${range.start}|${range.end}`;
  const hit = periodCache.get(key);
  if (hit && Date.now() - hit.at < PERIOD_TTL) return hit.rows;

  const today = new Date().toISOString().slice(0, 10);
  const pipelines = await sellbotPipelines(token);
  const perPipeline = await Promise.all(
    pipelines.map(async (p) => {
      const closed = (status: string) => deals(token, { pipeline_id: p.id, status, date_from: range.start, date_to: today });
      const [stages, won, lost, open] = await Promise.all([
        stagesOf(token, p.id).catch(() => [] as { id: string; name: string }[]),
        closed("won"),
        closed("lost"),
        deals(token, { pipeline_id: p.id, status: "open" }),
      ]);
      const stageName = new Map(stages.map((s) => [s.id, s.name]));
      const tag = (list: Deal[], status: PeriodRow["status"]) =>
        list.map((d) => ({ d, status, stage: d.deal_stage_id ? stageName.get(d.deal_stage_id) ?? null : null }));
      return [...tag(won.list, "won"), ...tag(lost.list, "lost"), ...tag(open.list, "open")].map((x) => ({ ...x, pipeline: p.name }));
    }),
  );

  const byLead = new Map<string, PeriodRow>();
  for (const x of perPipeline.flat()) {
    if (!inRange(day(x.d.deal_date_added), range)) continue;
    const leadId = x.d.lead_id || `deal:${x.d.deal_id}`;
    const cur = byLead.get(leadId);
    // Mesmo lead em vários negócios: fica a entrada mais antiga do período.
    if (cur && (cur.deal.deal_date_added ?? "") <= (x.d.deal_date_added ?? "")) continue;
    byLead.set(leadId, { leadId, deal: x.d, pipeline: x.pipeline, stage: x.stage, status: x.status });
  }
  const rows = [...byLead.values()].sort((a, b) => (b.deal.deal_date_added ?? "").localeCompare(a.deal.deal_date_added ?? ""));
  if (periodCache.size > 200) periodCache.clear();
  periodCache.set(key, { at: Date.now(), rows });
  return rows;
}

const digits = (v: string) => v.replace(/\D/g, "");
const fold = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export async function fetchSellbotLeadsByPeriod(
  clientId: number,
  opts: { page: number; limit: number; range: DateRange; search?: string },
): Promise<{ leads: SellbotLead[]; total: number; pages: number } | null> {
  const conn = await getSellbotConnection(clientId);
  if (!conn) return null;
  let rows = await periodRows(clientId, conn.token, opts.range);

  const s = opts.search?.trim();
  if (s) {
    const n = digits(s);
    const f = fold(s);
    rows = rows.filter(({ deal: d }) =>
      (d.lead_name && fold(d.lead_name).includes(f)) || (n.length >= 4 && d.lead_phone && digits(d.lead_phone).includes(n)),
    );
  }

  const pages = Math.max(1, Math.ceil(rows.length / opts.limit));
  const slice = rows.slice((opts.page - 1) * opts.limit, opts.page * opts.limit);
  const details = await Promise.all(slice.map((r) => (r.leadId.startsWith("deal:") ? null : leadDetail(conn.token, r.leadId))));

  const leads = slice.map((r, n): SellbotLead => {
    const d = r.deal;
    const base = toLead(
      {
        id: r.leadId,
        first_name: d.lead_name,
        phone: d.lead_phone,
        lead_owner_name: d.deal_owner_name,
        tags: d.deal_tags ?? [],
        channel: d.deal_source_channel,
        campaign: d.lead_campaign,
      },
      details[n],
    );
    // Atribuição do negócio (a mesma usada no dashboard) tem prioridade; o detalhe do lead completa o resto.
    const pick = (a: string | null | undefined, b: string | null) => clean(a) ?? b;
    return {
      ...base,
      name: details[n] ? base.name : clean(d.lead_name) ?? base.name,
      dateAdded: d.deal_date_added ?? base.dateAdded,
      utm: {
        source: pick(d.utm_source, base.utm.source),
        medium: pick(d.utm_medium, base.utm.medium),
        campaign: pick(d.utm_campaign, base.utm.campaign),
        content: pick(d.utm_content, base.utm.content),
        term: pick(d.utm_term, base.utm.term),
      },
      meta: {
        campaign: pick(d.meta_campaign_name, base.meta.campaign),
        adset: pick(d.meta_adset_name, base.meta.adset),
        ad: pick(d.meta_ad_name, base.meta.ad),
        form: pick(d.meta_form_name, base.meta.form),
      },
      deal: { pipeline: r.pipeline, stage: r.stage, status: r.status },
    };
  });
  return { leads, total: rows.length, pages };
}
