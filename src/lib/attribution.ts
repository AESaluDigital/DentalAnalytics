import type { ReportData, SellbotEntry } from "./types";

/** Plataforma de anúncio à qual um lead do CRM é atribuído. */
export type AdPlatform = "meta" | "google";

export type CrmByPlatform = Record<AdPlatform, number>;

/** Campanha de anúncio do relatório, para atribuir leads cuja origem só traz o nome/ID da campanha. */
export interface CampaignRef {
  id: string;
  name: string;
  platform: AdPlatform;
}

const norm = (s: string) => s.trim().toLowerCase();

/** Mídias que não são anúncio pago: um utm_source "google" com medium "organic" não é Google Ads. */
const NOT_PAID = /organic|organico|orgânico|referral|email|e-mail|newsletter/;
const META_SOURCE = /facebook|instagram|messenger|meta|(^|[^a-z])(fb|ig)([^a-z]|$)/;
const GOOGLE_SOURCE = /google|adwords|gads|youtube|(^|[^a-z])yt([^a-z]|$)/;

/**
 * Plataforma pela origem do lead: campanha da Meta (Lead Ads) ou utm_source.
 * Não depende das campanhas do relatório, então também vale para o período anterior.
 */
export function platformFromSource(e: Pick<SellbotEntry, "metaCampaignId" | "source" | "utm">): AdPlatform | null {
  if (e.metaCampaignId || e.source === "Meta Lead Ads") return "meta";
  const src = norm(e.utm.source ?? "");
  if (!src) return null;
  if (NOT_PAID.test(norm(e.utm.medium ?? ""))) return null;
  if (META_SOURCE.test(src)) return "meta";
  if (GOOGLE_SOURCE.test(src)) return "google";
  return null;
}

/** Índice das campanhas do relatório por ID e por nome. */
export function campaignIndex(campaigns: CampaignRef[]): Map<string, CampaignRef> {
  const index = new Map<string, CampaignRef>();
  for (const c of campaigns) {
    if (c.id) index.set(norm(c.id), c);
    index.set(norm(c.name), c);
  }
  return index;
}

/** Plataforma do lead: pela origem; se ela não disser, pela campanha (quando bate com uma do relatório). */
export function platformOf(e: SellbotEntry, index: Map<string, CampaignRef>): AdPlatform | null {
  const bySource = platformFromSource(e);
  if (bySource) return bySource;
  const c = (e.metaCampaignId && index.get(norm(e.metaCampaignId))) || (e.campaign && index.get(norm(e.campaign))) || null;
  return c?.platform ?? null;
}

export function reportCampaigns(data: ReportData): CampaignRef[] {
  return [
    ...(data.meta.status === "ok" ? data.meta.data.campaigns.map((c) => ({ id: c.id, name: c.name, platform: "meta" as const })) : []),
    ...(data.googleAds.status === "ok"
      ? data.googleAds.data.campaigns.map((c) => ({ id: c.id, name: c.name, platform: "google" as const }))
      : []),
  ];
}

/**
 * Faturamento das vendas do CRM (funis da visão Global, leads criados no período) atribuído a cada plataforma.
 * null quando não há CRM conectado no formato atual. `prev` é null em relatórios gerados antes desta conta.
 */
export function crmRevenueByPlatform(data: ReportData): { cur: CrmByPlatform; prev: CrmByPlatform | null } | null {
  if (data.sellbot?.status !== "ok" || data.sellbot.data.v !== 2) return null;
  const pipelines = data.sellbot.data.pipelines.filter((p) => p.inGlobal);
  const index = campaignIndex(reportCampaigns(data));
  const cur: CrmByPlatform = { meta: 0, google: 0 };
  for (const p of pipelines) {
    for (const e of p.entries) {
      if (e.status !== "won") continue;
      const pl = platformOf(e, index);
      if (pl) cur[pl] += e.value;
    }
  }
  let prev: CrmByPlatform | null = null;
  if (pipelines.every((p) => p.prev.wonValueByPlatform)) {
    prev = { meta: 0, google: 0 };
    for (const p of pipelines) {
      prev.meta += p.prev.wonValueByPlatform?.meta ?? 0;
      prev.google += p.prev.wonValueByPlatform?.google ?? 0;
      for (const w of p.prev.wonByCampaign ?? []) {
        const c = (w.metaCampaignId && index.get(norm(w.metaCampaignId))) || (w.campaign && index.get(norm(w.campaign))) || null;
        if (c) prev[c.platform] += w.value;
      }
    }
  }
  return { cur, prev };
}
