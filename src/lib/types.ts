/** Tipos compartilhados entre backend e template de relatório (sem segredos). */

export interface DateRange {
  /** YYYY-MM-DD */
  start: string;
  /** YYYY-MM-DD */
  end: string;
}

export interface AdsTotals {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValue: number;
  /** Só a Meta entrega alcance (pessoas únicas). */
  reach?: number;
}

export interface AdsDailyRow {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
}

export interface AdsCampaignRow {
  id: string;
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValue: number;
}

/** Métricas comuns a campanha, grupo, palavra-chave e termo de pesquisa. */
export interface AdsMetrics {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValue: number;
}

export interface GadsAdGroupRow extends AdsMetrics {
  id: string;
  campaignId: string;
  name: string;
}

export interface GadsKeywordRow extends AdsMetrics {
  id: string;
  campaignId: string;
  adGroupId: string;
  text: string;
  /** EXACT | PHRASE | BROAD */
  matchType: string;
}

export interface GadsSearchTermRow extends AdsMetrics {
  campaignId: string;
  adGroupId: string;
  term: string;
  /** Palavra-chave que acionou o termo (quando a API informa). */
  keyword: string | null;
  matchType: string | null;
}

/** Detalhamento do Google Ads: grupos de anúncios, palavras-chave e termos de pesquisa. */
export interface GoogleAdsBreakdown {
  adGroups: GadsAdGroupRow[];
  keywords: GadsKeywordRow[];
  searchTerms: GadsSearchTermRow[];
  /** Avisos quando uma das consultas falhou ou foi limitada (o restante do relatório segue normal). */
  notes: string[];
}

export interface AdsPlatformData {
  accountId: string;
  currency: string;
  /** Rótulo do que conta como conversão nesta plataforma. */
  conversionLabel: string;
  totals: AdsTotals;
  previousTotals: AdsTotals;
  daily: AdsDailyRow[];
  campaigns: AdsCampaignRow[];
  /** Só Google Ads. Ausente em relatórios antigos. */
  breakdown?: GoogleAdsBreakdown;
}

export interface Ga4Totals {
  sessions: number;
  totalUsers: number;
  newUsers: number;
  engagedSessions: number;
  keyEvents: number;
  totalRevenue: number;
}

export interface Ga4DailyRow {
  date: string;
  sessions: number;
  totalUsers: number;
  keyEvents: number;
}

export interface Ga4ChannelRow {
  channel: string;
  sessions: number;
  totalUsers: number;
  keyEvents: number;
  engagementRate: number;
}

export interface Ga4Data {
  propertyId: string;
  totals: Ga4Totals;
  previousTotals: Ga4Totals;
  daily: Ga4DailyRow[];
  channels: Ga4ChannelRow[];
}

/* ---------- Sellbot (CRM de vendas) ---------- */

/** Venda (negócio ganho) sem dados pessoais: só data, valor e origem. */
export interface SellbotSale {
  /** YYYY-MM-DD (data do ganho) */
  date: string;
  value: number;
  pipelineId: string;
  /** Origem legível (ex.: google / cpc, Meta Lead Ads, Formulário do site). */
  source: string;
  /** Campanha (utm_campaign, campanha da Meta ou do lead), quando houver. */
  campaign: string | null;
  /** ID da campanha da Meta, quando o lead veio de Lead Ads. */
  metaCampaignId: string | null;
}

export interface SellbotStage {
  id: string;
  name: string;
  /** Negócios abertos nesta etapa agora. */
  count: number;
  value: number;
}

export interface SellbotPipelineData {
  id: string;
  name: string;
  /** Entra na soma da visão Global. */
  inGlobal: boolean;
  won: { count: number; value: number };
  wonPrev: { count: number; value: number };
  lost: { count: number; value: number };
  lostPrev: { count: number };
  open: { count: number; value: number };
  stages: SellbotStage[];
  sales: SellbotSale[];
  lostReasons: { reason: string; count: number }[];
}

export interface SellbotData {
  pipelines: SellbotPipelineData[];
  notes: string[];
}

export type PlatformResult<T> =
  | { status: "ok"; data: T }
  | { status: "error"; message: string }
  | { status: "not_configured" };

export interface ReportData {
  version: 1;
  /** true quando gerado com DEMO_MODE (dados fictícios). */
  demo?: boolean;
  generatedAt: string;
  client: { id: number; name: string };
  range: DateRange;
  previousRange: DateRange;
  meta: PlatformResult<AdsPlatformData>;
  googleAds: PlatformResult<AdsPlatformData>;
  ga4: PlatformResult<Ga4Data>;
  /** Vendas do CRM (Sellbot). Ausente em relatórios antigos. */
  sellbot?: PlatformResult<SellbotData>;
}

export interface ReportAnalysis {
  resumo: string;
  destaques: string[];
  pontos_de_atencao: string[];
  recomendacoes: string[];
  por_canal: { canal: "meta" | "google_ads" | "ga4"; analise: string }[];
}

export interface ClientRow {
  id: number;
  name: string;
  meta_ad_account_id: string | null;
  meta_conversion_action: string;
  google_ads_customer_id: string | null;
  ga4_property_id: string | null;
  active: boolean;
}
