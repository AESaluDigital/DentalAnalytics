import "server-only";
import { createHmac } from "node:crypto";
import { env } from "../env";
import { metaAccessToken } from "../integrations";
import { eachDay } from "../dates";
import type {
  AccountFunds,
  AdsCampaignRow,
  AdsDailyRow,
  AdsPlatformData,
  AdsTotals,
  ConversionTypeRow,
  DateRange,
  MetaAdRow,
  MetaAdSetRow,
  MetaBreakdown,
  MetaCreative,
} from "../types";
import { PlatformError, fetchJson, num } from "./http";

/**
 * Meta Marketing API — Ads Insights
 * Docs: https://developers.facebook.com/docs/marketing-api/insights
 * GET /act_{ad_account_id}/insights
 */

interface ActionStat {
  action_type: string;
  value: string;
}

interface InsightRow {
  spend?: string;
  impressions?: string;
  reach?: string;
  inline_link_clicks?: string;
  actions?: ActionStat[];
  action_values?: ActionStat[];
  account_currency?: string;
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  date_start?: string;
}

interface InsightsResponse {
  data: InsightRow[];
  paging?: { next?: string };
}

const PLATFORM = "Meta Ads";
const MAX_PAGES = 20;

export async function metaCredentials() {
  const e = env();
  const token = await metaAccessToken();
  if (!token) {
    throw new PlatformError(PLATFORM, "Meta não conectada. Um admin deve conectar em Integrações.");
  }
  return { token, secret: e.META_APP_SECRET, version: e.META_API_VERSION };
}

export function appSecretProof(token: string, secret?: string): string | undefined {
  return secret ? createHmac("sha256", secret).update(token).digest("hex") : undefined;
}

async function insights(
  accountId: string,
  params: Record<string, string>,
): Promise<InsightRow[]> {
  const { token, secret, version } = await metaCredentials();
  const search = new URLSearchParams(params);
  const proof = appSecretProof(token, secret);
  if (proof) search.set("appsecret_proof", proof);

  let url: string | undefined =
    `https://graph.facebook.com/${version}/act_${encodeURIComponent(accountId)}/insights?${search}`;
  const rows: InsightRow[] = [];
  let pages = 0;

  while (url && pages < MAX_PAGES) {
    const res: InsightsResponse = await fetchJson<InsightsResponse>(PLATFORM, url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    rows.push(...(res.data ?? []));
    url = res.paging?.next;
    pages++;
  }
  return rows;
}

function timeRange(r: DateRange): string {
  return JSON.stringify({ since: r.start, until: r.end });
}

function actionValue(list: ActionStat[] | undefined, type: string): number {
  return num(list?.find((a) => a.action_type === type)?.value);
}

function toTotals(row: InsightRow | undefined, conversionAction: string): AdsTotals {
  return {
    spend: num(row?.spend),
    impressions: num(row?.impressions),
    clicks: num(row?.inline_link_clicks),
    reach: num(row?.reach),
    conversions: actionValue(row?.actions, conversionAction),
    conversionValue: actionValue(row?.action_values, conversionAction),
  };
}

/* ---------- Detalhamento: conjuntos → anúncios (criativos) ---------- */

const LIMIT_ADS = 300;

interface AdLookup {
  id?: string;
  preview_shareable_link?: string;
  creative?: { thumbnail_url?: string; image_url?: string; title?: string; body?: string };
}

const CREATIVE_FIELDS_BIG = "id,preview_shareable_link,creative.thumbnail_width(400).thumbnail_height(400){thumbnail_url,image_url,title,body}";
const CREATIVE_FIELDS = "id,preview_shareable_link,creative{thumbnail_url,image_url,title,body}";

/**
 * Prévia dos criativos, em lotes de 50 anúncios.
 * O parâmetro "?ids=" foi descontinuado na v26+; usamos a lista de anúncios da conta filtrada pelos IDs
 * (GET /act_{id}/ads) e, se a Meta recusar o filtro, o envio em lote da Graph API (POST / com "batch").
 */
async function creatives(accountId: string, ids: string[]): Promise<Map<string, MetaCreative>> {
  const { token, secret, version } = await metaCredentials();
  const out = new Map<string, MetaCreative>();
  const proof = appSecretProof(token, secret);
  const auth = { Authorization: `Bearer ${token}` };

  const viaAccount = async (batch: string[], fields: string): Promise<AdLookup[]> => {
    const q = new URLSearchParams({
      fields,
      filtering: JSON.stringify([{ field: "id", operator: "IN", value: batch }]),
      limit: String(batch.length),
    });
    if (proof) q.set("appsecret_proof", proof);
    const res = await fetchJson<{ data?: AdLookup[] }>(
      PLATFORM,
      `https://graph.facebook.com/${version}/act_${encodeURIComponent(accountId)}/ads?${q}`,
      { headers: auth },
    );
    return res.data ?? [];
  };

  const viaBatch = async (batch: string[], fields: string): Promise<AdLookup[]> => {
    const body = new URLSearchParams({
      include_headers: "false",
      batch: JSON.stringify(batch.map((id) => ({ method: "GET", relative_url: `${id}?fields=${encodeURIComponent(fields)}` }))),
    });
    if (proof) body.set("appsecret_proof", proof);
    const res = await fetchJson<({ code: number; body: string } | null)[]>(PLATFORM, `https://graph.facebook.com/${version}/`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    return (res ?? []).flatMap((r) => {
      if (!r || r.code !== 200) return [];
      try {
        return [JSON.parse(r.body) as AdLookup];
      } catch {
        return [];
      }
    });
  };

  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    // Tenta do jeito mais completo para o mais simples; a primeira que funcionar vale.
    // Se todas falharem, o erro da última sobe e aparece como aviso no relatório.
    let list: AdLookup[] | null = null;
    let lastErr: unknown = null;
    for (const attempt of [
      () => viaAccount(batch, CREATIVE_FIELDS_BIG),
      () => viaAccount(batch, CREATIVE_FIELDS),
      () => viaBatch(batch, CREATIVE_FIELDS),
    ]) {
      try {
        list = await attempt();
        break;
      } catch (err) {
        lastErr = err;
      }
    }
    if (list === null) throw lastErr;
    for (const a of list) {
      if (!a.id) continue;
      out.set(a.id, {
        thumbnail: a.creative?.thumbnail_url ?? null,
        image: a.creative?.image_url ?? null,
        title: a.creative?.title ?? null,
        body: a.creative?.body ?? null,
        previewLink: a.preview_shareable_link ?? null,
      });
    }
  }
  return out;
}

/* ---------- Resultado de cada conjunto (o que conta como conversão) ---------- */

interface AdSetGoal {
  id?: string;
  optimization_goal?: string;
  destination_type?: string;
  promoted_object?: { custom_event_type?: string; custom_conversion_id?: string };
}

/** Tipo de resultado: rótulo exibido e action_types da Meta aceitos (o primeiro presente vale). */
interface ResultKind {
  key: string;
  label: string;
  types: string[];
}

const MESSAGING: ResultKind = {
  key: "messaging",
  label: "Conversas iniciadas (WhatsApp/Messenger/Direct)",
  types: ["onsite_conversion.messaging_conversation_started_7d", "onsite_conversion.total_messaging_connection"],
};
const FORM: ResultKind = {
  key: "form",
  label: "Leads do formulário instantâneo",
  types: ["onsite_conversion.lead_grouped", "lead", "leadgen_grouped"],
};
const PAGE_VIEW: ResultKind = { key: "lpv", label: "Visualizações da página de destino", types: ["landing_page_view"] };
const LINK: ResultKind = { key: "link", label: "Cliques no link", types: ["link_click"] };

const PIXEL: Record<string, ResultKind> = {
  LEAD: { key: "px_lead", label: "Leads no site (pixel)", types: ["offsite_conversion.fb_pixel_lead", "lead"] },
  CONTACT: { key: "px_contact", label: "Contatos no site (pixel)", types: ["offsite_conversion.fb_pixel_contact", "contact_total", "contact"] },
  SCHEDULE: { key: "px_schedule", label: "Agendamentos no site (pixel)", types: ["offsite_conversion.fb_pixel_schedule", "schedule_total", "schedule"] },
  COMPLETE_REGISTRATION: {
    key: "px_registration",
    label: "Cadastros no site (pixel)",
    types: ["offsite_conversion.fb_pixel_complete_registration", "complete_registration"],
  },
  SUBMIT_APPLICATION: { key: "px_application", label: "Solicitações enviadas (pixel)", types: ["offsite_conversion.fb_pixel_submit_application", "submit_application_total"] },
  PURCHASE: { key: "px_purchase", label: "Compras no site (pixel)", types: ["offsite_conversion.fb_pixel_purchase", "purchase"] },
  OTHER: { key: "px_custom", label: "Conversões personalizadas (pixel)", types: ["offsite_conversion.fb_pixel_custom", "offsite_conversion.custom"] },
};

/** Descobre o resultado do conjunto pelo objetivo de otimização, destino e evento do pixel. */
function kindOf(goal: AdSetGoal | undefined): ResultKind | null {
  if (!goal) return null;
  const g = goal.optimization_goal ?? "";
  const d = goal.destination_type ?? "";
  if (g === "CONVERSATIONS" || g === "REPLIES" || /WHATSAPP|MESSENGER|INSTAGRAM_DIRECT|MESSAGING/.test(d)) return MESSAGING;
  if (g === "LEAD_GENERATION" || g === "QUALITY_LEAD") return FORM;
  if (g === "OFFSITE_CONVERSIONS" || g === "VALUE" || g === "CONVERSIONS") {
    const ev = goal.promoted_object?.custom_event_type ?? (goal.promoted_object?.custom_conversion_id ? "OTHER" : "LEAD");
    return PIXEL[ev] ?? PIXEL.OTHER;
  }
  if (g === "LANDING_PAGE_VIEWS") return PAGE_VIEW;
  if (g === "LINK_CLICKS") return LINK;
  return null;
}

/** Objetivos dos conjuntos da conta (inclui pausados/arquivados que tiveram entrega). */
async function adSetGoals(accountId: string): Promise<Map<string, AdSetGoal>> {
  const { token, secret, version } = await metaCredentials();
  const q = new URLSearchParams({
    fields: "id,optimization_goal,destination_type,promoted_object",
    limit: "500",
    effective_status: JSON.stringify(["ACTIVE", "PAUSED", "ARCHIVED", "CAMPAIGN_PAUSED", "ADSET_PAUSED", "IN_PROCESS", "WITH_ISSUES"]),
  });
  const proof = appSecretProof(token, secret);
  if (proof) q.set("appsecret_proof", proof);
  let url: string | undefined = `https://graph.facebook.com/${version}/act_${encodeURIComponent(accountId)}/adsets?${q}`;
  const out = new Map<string, AdSetGoal>();
  for (let page = 0; url && page < 10; page++) {
    const res: { data?: AdSetGoal[]; paging?: { next?: string } } = await fetchJson(PLATFORM, url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    for (const a of res.data ?? []) if (a.id) out.set(a.id, a);
    url = res.paging?.next;
  }
  return out;
}

/** Resolve o resultado de uma linha de insights (nível conjunto ou anúncio). */
type Resolver = (row: InsightRow) => { kind: ResultKind; conversions: number; value: number };

function makeResolver(goals: Map<string, AdSetGoal>, fallbackAction: string): Resolver {
  const fallback: ResultKind = { key: `fb_${fallbackAction}`, label: fallbackLabel(fallbackAction), types: [fallbackAction] };
  return (row) => {
    const kind = kindOf(goals.get(row.adset_id ?? "")) ?? fallback;
    for (const t of kind.types) {
      const c = actionValue(row.actions, t);
      if (c > 0) return { kind, conversions: c, value: actionValue(row.action_values, t) };
    }
    return { kind, conversions: 0, value: 0 };
  };
}

function fallbackLabel(action: string): string {
  const all = [MESSAGING, FORM, PAGE_VIEW, LINK, ...Object.values(PIXEL)];
  return all.find((k) => k.types[0] === action)?.label ?? (action === "lead" ? "Leads" : action);
}

function metricsWith(r: InsightRow, resolve: Resolver) {
  const res = resolve(r);
  return {
    spend: num(r.spend),
    impressions: num(r.impressions),
    clicks: num(r.inline_link_clicks),
    conversions: res.conversions,
    conversionValue: res.value,
  };
}

/** Soma conversões por tipo (com o investimento dos conjuntos daquele tipo). */
function byKind(rows: InsightRow[], resolve: Resolver): ConversionTypeRow[] {
  const m = new Map<string, ConversionTypeRow>();
  for (const r of rows) {
    const res = resolve(r);
    const x = m.get(res.kind.key) ?? { label: res.kind.label, conversions: 0, conversionValue: 0, spend: 0 };
    x.conversions += res.conversions;
    x.conversionValue += res.value;
    x.spend = (x.spend ?? 0) + num(r.spend);
    m.set(res.kind.key, x);
  }
  return [...m.values()].filter((x) => x.conversions > 0 || (x.spend ?? 0) > 0).sort((a, b) => b.conversions - a.conversions);
}

function buildBreakdown(
  sets: InsightRow[],
  ads: InsightRow[],
  previews: Map<string, MetaCreative>,
  resolve: Resolver,
  notes: string[],
): MetaBreakdown {
  const withDelivery = ads.filter((a) => num(a.impressions) > 0).sort((a, b) => num(b.spend) - num(a.spend));
  const topAds = withDelivery.slice(0, LIMIT_ADS);
  if (withDelivery.length > LIMIT_ADS) notes.push(`Exibindo os ${LIMIT_ADS} anúncios com maior investimento.`);

  // Se a consulta de conjuntos falhar, monta os conjuntos somando os anúncios (que trazem o nome do conjunto).
  let adSetRows: MetaAdSetRow[] = sets
    .filter((r) => num(r.impressions) > 0)
    .map<MetaAdSetRow>((r) => ({ id: r.adset_id ?? "", campaignId: r.campaign_id ?? "", name: r.adset_name ?? "(sem nome)", ...metricsWith(r, resolve) }));
  if (!adSetRows.length && withDelivery.length) {
    const m = new Map<string, MetaAdSetRow>();
    for (const r of withDelivery) {
      const id = r.adset_id ?? "";
      const x = m.get(id) ?? { id, campaignId: r.campaign_id ?? "", name: r.adset_name ?? "(sem nome)", spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0 };
      const k = metricsWith(r, resolve);
      x.spend += k.spend; x.impressions += k.impressions; x.clicks += k.clicks; x.conversions += k.conversions; x.conversionValue += k.conversionValue;
      m.set(id, x);
    }
    adSetRows = [...m.values()].sort((a, b) => b.spend - a.spend);
  }

  return {
    adSets: adSetRows,
    ads: topAds.map<MetaAdRow>((r) => ({
      id: r.ad_id ?? "",
      campaignId: r.campaign_id ?? "",
      adSetId: r.adset_id ?? "",
      adSetName: r.adset_name,
      campaignName: r.campaign_name,
      name: r.ad_name ?? "(sem nome)",
      creative: previews.get(r.ad_id ?? "") ?? null,
      ...metricsWith(r, resolve),
    })),
    notes,
  };
}

/**
 * Meta Ads: o que conta como conversão é o RESULTADO de cada conjunto de anúncios (conversas no WhatsApp,
 * leads do formulário, evento do pixel no site…), como no Gerenciador de Anúncios. Sem objetivo identificável,
 * vale a ação configurada no cliente (meta_conversion_action).
 */
export async function fetchMeta(
  accountId: string,
  conversionAction: string,
  range: DateRange,
  prev: DateRange,
): Promise<AdsPlatformData> {
  const notes: string[] = [];
  const base = "spend,impressions,inline_link_clicks,actions,action_values";
  const soft = async (label: string, fn: () => Promise<InsightRow[]>): Promise<InsightRow[]> => {
    try {
      return await fn();
    } catch (err) {
      notes.push(`Não foi possível carregar ${label}${err instanceof PlatformError ? `: ${err.message}` : "."}`);
      return [];
    }
  };

  const [current, previous, goals, setsCur, setsPrev, setsDaily, campaigns, ads] = await Promise.all([
    insights(accountId, { level: "account", time_range: timeRange(range), fields: `${base},reach,account_currency` }),
    insights(accountId, { level: "account", time_range: timeRange(prev), fields: `${base},reach` }),
    adSetGoals(accountId).catch((err) => {
      notes.push(`Objetivos dos conjuntos indisponíveis (usando "${conversionAction}" como conversão)${err instanceof PlatformError ? `: ${err.message}` : "."}`);
      return new Map<string, AdSetGoal>();
    }),
    soft("os conjuntos de anúncios", () =>
      insights(accountId, { level: "adset", time_range: timeRange(range), fields: `campaign_id,adset_id,adset_name,${base}`, sort: "spend_descending", limit: "500" }),
    ),
    insights(accountId, { level: "adset", time_range: timeRange(prev), fields: `adset_id,${base}`, limit: "500" }).catch(() => [] as InsightRow[]),
    insights(accountId, { level: "adset", time_range: timeRange(range), time_increment: "1", fields: `adset_id,${base}`, limit: "500" }).catch(() => [] as InsightRow[]),
    insights(accountId, {
      level: "campaign",
      time_range: timeRange(range),
      fields: `campaign_id,campaign_name,${base}`,
      sort: "spend_descending",
      limit: "100",
    }),
    soft("os anúncios", () =>
      insights(accountId, { level: "ad", time_range: timeRange(range), fields: `campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,${base}`, sort: "spend_descending", limit: "500" }),
    ),
  ]);

  const resolve = makeResolver(goals, conversionAction);
  // Com os conjuntos disponíveis, as conversões vêm da soma dos resultados de cada conjunto.
  const useSets = setsCur.length > 0;
  const sum = (rows: InsightRow[]) =>
    rows.reduce((a, r) => {
      const x = resolve(r);
      return { conversions: a.conversions + x.conversions, value: a.value + x.value };
    }, { conversions: 0, value: 0 });

  const totals = toTotals(current[0], conversionAction);
  const previousTotals = toTotals(previous[0], conversionAction);
  if (useSets) {
    const c = sum(setsCur);
    totals.conversions = c.conversions;
    totals.conversionValue = c.value;
    if (setsPrev.length) {
      const p = sum(setsPrev);
      previousTotals.conversions = p.conversions;
      previousTotals.conversionValue = p.value;
    }
  }

  // Diário: investimento/impressões/cliques somados dos conjuntos; conversões pelo resultado de cada um.
  const daily = new Map<string, AdsDailyRow>();
  for (const date of eachDay(range)) daily.set(date, { date, spend: 0, impressions: 0, clicks: 0, conversions: 0 });
  for (const r of setsDaily) {
    const d = daily.get(r.date_start ?? "");
    if (!d) continue;
    d.spend += num(r.spend);
    d.impressions += num(r.impressions);
    d.clicks += num(r.inline_link_clicks);
    d.conversions += resolve(r).conversions;
  }
  const dailyRows = [...daily.values()];

  // Campanhas: métricas da própria campanha; conversões = soma dos resultados dos seus conjuntos.
  const setsByCampaign = new Map<string, InsightRow[]>();
  for (const r of setsCur) {
    const list = setsByCampaign.get(r.campaign_id ?? "") ?? [];
    list.push(r);
    setsByCampaign.set(r.campaign_id ?? "", list);
  }
  const campaignRows: AdsCampaignRow[] = campaigns
    .map((r) => {
      const sets = setsByCampaign.get(r.campaign_id ?? "");
      const conv = sets ? sum(sets) : { conversions: actionValue(r.actions, conversionAction), value: actionValue(r.action_values, conversionAction) };
      return {
        id: r.campaign_id ?? "",
        name: r.campaign_name ?? "(sem nome)",
        spend: num(r.spend),
        impressions: num(r.impressions),
        clicks: num(r.inline_link_clicks),
        conversions: conv.conversions,
        conversionValue: conv.value,
        conversionTypes: sets ? byKind(sets, resolve) : undefined,
      };
    })
    .sort((a, b) => b.spend - a.spend);

  const conversionTypes = useSets ? byKind(setsCur, resolve) : [];
  const topAdIds = ads.filter((a) => num(a.impressions) > 0).sort((a, b) => num(b.spend) - num(a.spend)).slice(0, LIMIT_ADS)
    .map((a) => a.ad_id ?? "").filter(Boolean);
  const previews = await creatives(accountId, topAdIds).catch((err) => {
    notes.push(`Prévias dos criativos indisponíveis${err instanceof PlatformError ? `: ${err.message}` : "."}`);
    return new Map<string, MetaCreative>();
  });

  return {
    accountId,
    currency: current[0]?.account_currency ?? "BRL",
    conversionLabel: conversionTypes.length > 1
      ? "Resultado de cada campanha (veja Conversões por tipo)"
      : conversionTypes[0]?.label ?? fallbackLabel(conversionAction),
    totals,
    previousTotals,
    daily: dailyRows,
    campaigns: campaignRows,
    conversionTypes,
    metaBreakdown: buildBreakdown(setsCur, ads, previews, resolve, notes),
  };
}

/* ---------- Orçamento (consultas leves) ---------- */

/** Gasto diário da conta no intervalo (para o acompanhamento de orçamento do mês). */
export async function metaDailySpend(accountId: string, range: DateRange): Promise<{ currency: string; daily: { date: string; spend: number }[] }> {
  const rows = await insights(accountId, {
    level: "account",
    time_range: timeRange(range),
    time_increment: "1",
    fields: "spend,account_currency",
    limit: "100",
  });
  const byDate = new Map(rows.map((r) => [r.date_start, num(r.spend)]));
  return {
    currency: rows[0]?.account_currency ?? "BRL",
    daily: eachDay(range).map((date) => ({ date, spend: byDate.get(date) ?? 0 })),
  };
}

/**
 * Limite de gastos e forma de pagamento da conta (Graph API: GET /act_{id}).
 * spend_cap e amount_spent vêm em centavos; spend_cap "0" = sem limite.
 */
export async function metaAccountFunds(accountId: string): Promise<AccountFunds> {
  const { token, secret, version } = await metaCredentials();
  const q = new URLSearchParams({ fields: "spend_cap,amount_spent,funding_source_details" });
  const proof = appSecretProof(token, secret);
  if (proof) q.set("appsecret_proof", proof);
  const r = await fetchJson<{ spend_cap?: string; amount_spent?: string; funding_source_details?: { display_string?: string } }>(
    PLATFORM,
    `https://graph.facebook.com/${version}/act_${encodeURIComponent(accountId)}?${q}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const cap = num(r.spend_cap) / 100;
  const spent = num(r.amount_spent) / 100;
  return {
    limit: cap > 0 ? cap : null,
    remaining: cap > 0 ? Math.max(cap - spent, 0) : null,
    spent: cap > 0 ? spent : null,
    dailyBudget: null,
    text: r.funding_source_details?.display_string ?? null,
  };
}

/* ---------- Visão geral (consulta leve) ---------- */

/**
 * Só os totais do período (investimento, impressões, cliques e conversões), com a mesma regra de conversão
 * do dashboard completo (resultado de cada conjunto). Sem campanhas, anúncios nem criativos.
 */
export async function metaTotals(accountId: string, conversionAction: string, range: DateRange): Promise<{ currency: string; totals: AdsTotals }> {
  const base = "spend,impressions,inline_link_clicks,actions,action_values";
  const [account, sets, goals] = await Promise.all([
    insights(accountId, { level: "account", time_range: timeRange(range), fields: `${base},account_currency` }),
    insights(accountId, { level: "adset", time_range: timeRange(range), fields: `adset_id,${base}`, limit: "500" }).catch(() => [] as InsightRow[]),
    adSetGoals(accountId).catch(() => new Map<string, AdSetGoal>()),
  ]);
  const totals = toTotals(account[0], conversionAction);
  delete totals.reach;
  if (sets.length) {
    const resolve = makeResolver(goals, conversionAction);
    totals.conversions = 0;
    totals.conversionValue = 0;
    for (const r of sets) {
      const x = resolve(r);
      totals.conversions += x.conversions;
      totals.conversionValue += x.value;
    }
  }
  return { currency: account[0]?.account_currency ?? "BRL", totals };
}
