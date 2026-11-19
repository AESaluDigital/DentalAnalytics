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

export interface AdsPlatformData {
  accountId: string;
  currency: string;
  /** Rótulo do que conta como conversão nesta plataforma. */
  conversionLabel: string;
  totals: AdsTotals;
  previousTotals: AdsTotals;
  daily: AdsDailyRow[];
  campaigns: AdsCampaignRow[];
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
