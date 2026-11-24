import "server-only";
import { env } from "../env";
import { eachDay } from "../dates";
import type {
  AdsCampaignRow,
  AdsDailyRow,
  AdsPlatformData,
  AdsTotals,
  DateRange,
  GadsAdGroupRow,
  GadsKeywordRow,
  GadsSearchTermRow,
  GoogleAdsBreakdown,
  ConversionTypeRow,
} from "../types";
import { googleAccessToken } from "./google-oauth";
import { PlatformError, fetchJson, num } from "./http";

/**
 * Google Ads API (REST) — GoogleAdsService.Search com GAQL
 * Docs: https://developers.google.com/google-ads/api/rest/reference/rest/latest/customers.googleAds/search
 * POST https://googleads.googleapis.com/{version}/customers/{customerId}/googleAds:search
 */

interface Metrics {
  costMicros?: string;
  impressions?: string;
  clicks?: string;
  conversions?: number;
  conversionsValue?: number;
}

interface SearchRow {
  customer?: { currencyCode?: string };
  campaign?: { id?: string; name?: string };
  adGroup?: { id?: string; name?: string };
  adGroupCriterion?: { criterionId?: string; keyword?: { text?: string; matchType?: string } };
  searchTermView?: { searchTerm?: string };
  segments?: {
    date?: string;
    keyword?: { info?: { text?: string; matchType?: string } };
    conversionActionName?: string;
    conversionActionCategory?: string;
  };
  metrics?: Metrics;
}

interface SearchResponse {
  results?: SearchRow[];
  nextPageToken?: string;
}

const PLATFORM = "Google Ads";
const MAX_PAGES = 20;

async function search(customerId: string, query: string): Promise<SearchRow[]> {
  const e = env();
  if (!e.GOOGLE_ADS_DEVELOPER_TOKEN) {
    throw new PlatformError(PLATFORM, "GOOGLE_ADS_DEVELOPER_TOKEN não configurado no servidor.");
  }
  const token = await googleAccessToken(PLATFORM);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "developer-token": e.GOOGLE_ADS_DEVELOPER_TOKEN,
    "Content-Type": "application/json",
  };
  if (e.GOOGLE_ADS_LOGIN_CUSTOMER_ID) headers["login-customer-id"] = e.GOOGLE_ADS_LOGIN_CUSTOMER_ID;

  const url = `https://googleads.googleapis.com/${e.GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:search`;
  const rows: SearchRow[] = [];
  let pageToken: string | undefined;
  let pages = 0;

  do {
    const body: { query: string; pageToken?: string } = { query };
    if (pageToken) body.pageToken = pageToken;
    const res: SearchResponse = await fetchJson<SearchResponse>(PLATFORM, url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    rows.push(...(res.results ?? []));
    pageToken = res.nextPageToken;
    pages++;
  } while (pageToken && pages < MAX_PAGES);

  return rows;
}

function between(r: DateRange): string {
  // Datas já validadas como YYYY-MM-DD antes de chegar aqui.
  return `segments.date BETWEEN '${r.start}' AND '${r.end}'`;
}

function totalsFrom(m: Metrics | undefined): AdsTotals {
  return {
    spend: num(m?.costMicros) / 1_000_000,
    impressions: num(m?.impressions),
    clicks: num(m?.clicks),
    conversions: num(m?.conversions),
    conversionValue: num(m?.conversionsValue),
  };
}

const METRICS =
  "metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value";

/* ---------- Detalhamento: grupos → palavras-chave → termos de pesquisa ---------- */

const LIMIT_AD_GROUPS = 1000;
const LIMIT_KEYWORDS = 2000;
const LIMIT_TERMS = 1000;

function metricsOf(m: Metrics | undefined) {
  const t = totalsFrom(m);
  return { spend: t.spend, impressions: t.impressions, clicks: t.clicks, conversions: t.conversions, conversionValue: t.conversionValue };
}

/** Uma consulta que falha não derruba o relatório: vira um aviso. */
async function soft<T>(label: string, notes: string[], fn: () => Promise<T[]>): Promise<T[]> {
  try {
    return await fn();
  } catch (err) {
    notes.push(`Não foi possível carregar ${label}${err instanceof PlatformError ? `: ${err.message}` : "."}`);
    return [];
  }
}

async function fetchBreakdown(customerId: string, range: DateRange): Promise<GoogleAdsBreakdown> {
  const notes: string[] = [];
  const where = `${between(range)} AND metrics.impressions > 0`;

  const [groups, keywords, terms] = await Promise.all([
    soft("os grupos de anúncios", notes, () =>
      search(
        customerId,
        `SELECT campaign.id, ad_group.id, ad_group.name, ${METRICS} FROM ad_group
         WHERE ${where} ORDER BY metrics.cost_micros DESC LIMIT ${LIMIT_AD_GROUPS}`,
      ),
    ),
    soft("as palavras-chave", notes, () =>
      search(
        customerId,
        `SELECT campaign.id, ad_group.id, ad_group_criterion.criterion_id, ad_group_criterion.keyword.text,
                ad_group_criterion.keyword.match_type, ${METRICS} FROM keyword_view
         WHERE ${where} ORDER BY metrics.cost_micros DESC LIMIT ${LIMIT_KEYWORDS}`,
      ),
    ),
    soft("os termos de pesquisa", notes, async () => {
      const base = (withKeyword: boolean) =>
        `SELECT campaign.id, ad_group.id, search_term_view.search_term,${
          withKeyword ? " segments.keyword.info.text, segments.keyword.info.match_type," : ""
        } ${METRICS} FROM search_term_view
         WHERE ${where} ORDER BY metrics.cost_micros DESC, metrics.impressions DESC LIMIT ${LIMIT_TERMS}`;
      // Com a palavra-chave que acionou o termo; se a API recusar, busca sem ela.
      try {
        return await search(customerId, base(true));
      } catch {
        return search(customerId, base(false));
      }
    }),
  ]);

  if (groups.length >= LIMIT_AD_GROUPS) notes.push(`Exibindo os ${LIMIT_AD_GROUPS} grupos com maior investimento.`);
  if (keywords.length >= LIMIT_KEYWORDS) notes.push(`Exibindo as ${LIMIT_KEYWORDS} palavras-chave com maior investimento.`);
  if (terms.length >= LIMIT_TERMS) notes.push(`Exibindo os ${LIMIT_TERMS} termos de pesquisa com maior investimento.`);

  return {
    adGroups: groups.map<GadsAdGroupRow>((r) => ({
      id: r.adGroup?.id ?? "",
      campaignId: r.campaign?.id ?? "",
      name: r.adGroup?.name ?? "(sem nome)",
      ...metricsOf(r.metrics),
    })),
    keywords: keywords.map<GadsKeywordRow>((r) => ({
      id: r.adGroupCriterion?.criterionId ?? "",
      campaignId: r.campaign?.id ?? "",
      adGroupId: r.adGroup?.id ?? "",
      text: r.adGroupCriterion?.keyword?.text ?? "(sem texto)",
      matchType: r.adGroupCriterion?.keyword?.matchType ?? "",
      ...metricsOf(r.metrics),
    })),
    searchTerms: terms.map<GadsSearchTermRow>((r) => ({
      campaignId: r.campaign?.id ?? "",
      adGroupId: r.adGroup?.id ?? "",
      term: r.searchTermView?.searchTerm ?? "(sem termo)",
      keyword: r.segments?.keyword?.info?.text ?? null,
      matchType: r.segments?.keyword?.info?.matchType ?? null,
      ...metricsOf(r.metrics),
    })),
    notes,
  };
}

/** Categorias das ações de conversão do Google Ads (quando a ação não tem nome). */
const CATEGORY_LABEL: Record<string, string> = {
  CONTACT: "Contato",
  SUBMIT_LEAD_FORM: "Envio de formulário",
  PHONE_CALL_LEAD: "Ligações",
  BOOK_APPOINTMENT: "Agendamentos",
  REQUEST_QUOTE: "Pedidos de orçamento",
  GET_DIRECTIONS: "Rotas (como chegar)",
  OUTBOUND_CLICK: "Cliques de saída",
  SIGNUP: "Cadastros",
  PAGE_VIEW: "Visualizações de página",
  PURCHASE: "Compras",
  QUALIFIED_LEAD: "Leads qualificados",
  CONVERTED_LEAD: "Leads convertidos",
  ENGAGEMENT: "Engajamento",
  STORE_VISIT: "Visitas à loja",
  DEFAULT: "Outras conversões",
};

export async function fetchGoogleAds(
  customerId: string,
  range: DateRange,
  prev: DateRange,
): Promise<AdsPlatformData> {
  const [daily, previous, campaigns, breakdown, byAction] = await Promise.all([
    search(
      customerId,
      `SELECT customer.currency_code, segments.date, ${METRICS} FROM customer WHERE ${between(range)}`,
    ),
    search(customerId, `SELECT ${METRICS} FROM customer WHERE ${between(prev)}`),
    search(
      customerId,
      `SELECT campaign.id, campaign.name, ${METRICS} FROM campaign
       WHERE ${between(range)} AND metrics.impressions > 0
       ORDER BY metrics.cost_micros DESC LIMIT 100`,
    ),
    fetchBreakdown(customerId, range),
    // Conversões por ação de conversão (ex.: "Clique no WhatsApp", "Formulário"). Falha não derruba o relatório.
    search(
      customerId,
      `SELECT campaign.id, segments.conversion_action_name, segments.conversion_action_category,
              metrics.conversions, metrics.conversions_value
       FROM campaign WHERE ${between(range)} AND metrics.conversions > 0`,
    ).catch(() => [] as SearchRow[]),
  ]);

  // Agrupa por ação de conversão: por campanha e no total da conta.
  const actionLabel = (r: SearchRow) =>
    r.segments?.conversionActionName || CATEGORY_LABEL[r.segments?.conversionActionCategory ?? ""] || "Outras conversões";
  const perCampaign = new Map<string, Map<string, ConversionTypeRow>>();
  const total = new Map<string, ConversionTypeRow>();
  for (const r of byAction) {
    const label = actionLabel(r);
    const c = num(r.metrics?.conversions);
    const v = num(r.metrics?.conversionsValue);
    const id = r.campaign?.id ?? "";
    const m = perCampaign.get(id) ?? new Map<string, ConversionTypeRow>();
    for (const target of [m, total]) {
      const x = target.get(label) ?? { label, conversions: 0, conversionValue: 0 };
      x.conversions += c;
      x.conversionValue += v;
      target.set(label, x);
    }
    perCampaign.set(id, m);
  }
  const sorted = (m: Map<string, ConversionTypeRow> | undefined) =>
    m ? [...m.values()].sort((a, b) => b.conversions - a.conversions) : undefined;

  const byDate = new Map(daily.map((r) => [r.segments?.date, r.metrics]));
  const dailyRows: AdsDailyRow[] = eachDay(range).map((date) => {
    const t = totalsFrom(byDate.get(date));
    return { date, spend: t.spend, impressions: t.impressions, clicks: t.clicks, conversions: t.conversions };
  });

  const totals = daily.reduce<AdsTotals>(
    (acc, r) => {
      const t = totalsFrom(r.metrics);
      acc.spend += t.spend;
      acc.impressions += t.impressions;
      acc.clicks += t.clicks;
      acc.conversions += t.conversions;
      acc.conversionValue += t.conversionValue;
      return acc;
    },
    { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0 },
  );

  const campaignRows: AdsCampaignRow[] = campaigns.map((r) => ({
    id: r.campaign?.id ?? "",
    name: r.campaign?.name ?? "(sem nome)",
    ...totalsFrom(r.metrics),
    conversionTypes: sorted(perCampaign.get(r.campaign?.id ?? "")),
  }));

  return {
    accountId: customerId,
    currency: daily[0]?.customer?.currencyCode ?? "BRL",
    conversionLabel: "Conversões (Google Ads)",
    totals,
    previousTotals: totalsFrom(previous[0]?.metrics),
    daily: dailyRows,
    campaigns: campaignRows,
    breakdown,
    conversionTypes: sorted(total) ?? [],
  };
}

/* ---------- Orçamento (consultas leves) ---------- */

/** Gasto diário da conta no intervalo (para o acompanhamento de orçamento do mês). */
export async function googleDailySpend(customerId: string, range: DateRange): Promise<{ currency: string; daily: { date: string; spend: number }[] }> {
  const rows = await search(customerId, `SELECT customer.currency_code, segments.date, metrics.cost_micros FROM customer WHERE ${between(range)}`);
  const byDate = new Map(rows.map((r) => [r.segments?.date, num(r.metrics?.costMicros) / 1_000_000]));
  return {
    currency: rows[0]?.customer?.currencyCode ?? "BRL",
    daily: eachDay(range).map((date) => ({ date, spend: byDate.get(date) ?? 0 })),
  };
}

interface BudgetRow {
  accountBudget?: {
    approvedSpendingLimitMicros?: string;
    adjustedSpendingLimitMicros?: string;
    amountServedMicros?: string;
    approvedEndDateTime?: string;
    approvedSpendingLimitType?: string;
  };
}

/** Orçamento da conta (faturamento mensal/pedido de orçamento): limite aprovado − valor já veiculado. */
export async function googleAccountBudget(customerId: string): Promise<{ remaining: number | null; limit: number | null; text: string | null }> {
  const rows = (await search(
    customerId,
    `SELECT account_budget.approved_spending_limit_micros, account_budget.adjusted_spending_limit_micros,
            account_budget.amount_served_micros, account_budget.approved_end_date_time,
            account_budget.approved_spending_limit_type
     FROM account_budget WHERE account_budget.status = 'APPROVED'`,
  )) as BudgetRow[];
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  const active = rows
    .map((r) => r.accountBudget ?? {})
    .filter((b) => !b.approvedEndDateTime || b.approvedEndDateTime >= now);
  const b = active[0];
  if (!b) return { remaining: null, limit: null, text: null };
  if (b.approvedSpendingLimitType === "INFINITE") return { remaining: null, limit: null, text: "Orçamento da conta sem limite" };
  const limit = num(b.adjustedSpendingLimitMicros ?? b.approvedSpendingLimitMicros) / 1_000_000;
  const served = num(b.amountServedMicros) / 1_000_000;
  return { limit: limit || null, remaining: limit ? Math.max(limit - served, 0) : null, text: null };
}
