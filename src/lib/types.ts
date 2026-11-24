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

/** Conversões de um tipo (ex.: "Conversas no WhatsApp", "Formulário instantâneo", ação do Google). */
export interface ConversionTypeRow {
  label: string;
  conversions: number;
  conversionValue: number;
  /** Investimento das campanhas/conjuntos que otimizam para este tipo (só Meta). */
  spend?: number;
}

export interface AdsCampaignRow {
  id: string;
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValue: number;
  /** De onde vieram as conversões desta campanha. */
  conversionTypes?: ConversionTypeRow[];
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

export interface MetaAdSetRow extends AdsMetrics {
  id: string;
  campaignId: string;
  name: string;
}

/** Prévia do criativo (URLs da Meta expiram depois de alguns dias em relatórios salvos). */
export interface MetaCreative {
  thumbnail: string | null;
  image: string | null;
  title: string | null;
  body: string | null;
  /** Link de prévia do anúncio no Facebook. */
  previewLink: string | null;
}

export interface MetaAdRow extends AdsMetrics {
  id: string;
  campaignId: string;
  adSetId: string;
  /** Nome do conjunto (para montar a cascata mesmo se a consulta de conjuntos falhar). */
  adSetName?: string;
  campaignName?: string;
  name: string;
  creative: MetaCreative | null;
}

/** Detalhamento da Meta: conjuntos de anúncios e anúncios (criativos). */
export interface MetaBreakdown {
  adSets: MetaAdSetRow[];
  ads: MetaAdRow[];
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
  /** Conversões da conta somadas por tipo. */
  conversionTypes?: ConversionTypeRow[];
  /** Só Google Ads. Ausente em relatórios antigos. */
  breakdown?: GoogleAdsBreakdown;
  /** Só Meta Ads. Ausente em relatórios antigos. */
  metaBreakdown?: MetaBreakdown;
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

export interface SellbotUtm {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  term: string | null;
  content: string | null;
}

/**
 * Negócio (lead que entrou no funil) CRIADO no período — sem dados pessoais.
 * Todos os números da Sellbot seguem a data de criação do negócio.
 */
export interface SellbotEntry {
  /** YYYY-MM-DD (data de criação) */
  date: string;
  status: "won" | "lost" | "open";
  value: number;
  /** Origem legível (ex.: google / cpc, Meta Lead Ads, Formulário do site). */
  source: string;
  /** Campanha (campanha da Meta, utm_campaign ou campanha do lead), quando houver. */
  campaign: string | null;
  metaCampaignId: string | null;
  utm: SellbotUtm;
  lostReason: string | null;
}

export interface SellbotStage {
  id: string;
  name: string;
  /** Negócios criados no período que estão abertos nesta etapa. */
  count: number;
  value: number;
}

export interface SellbotPipelineData {
  id: string;
  name: string;
  /** Entra na soma da visão Global. */
  inGlobal: boolean;
  entries: SellbotEntry[];
  /** Mesmos números para os negócios criados no período anterior (comparação). */
  prev: { created: number; won: number; wonValue: number; lost: number };
  stages: SellbotStage[];
}

export interface SellbotData {
  /** 2 = tudo pela data de criação (versão atual). Relatórios antigos não têm este campo. */
  v?: 2;
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
