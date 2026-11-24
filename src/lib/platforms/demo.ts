import "server-only";
import { eachDay } from "../dates";
import type {
  AdsCampaignRow,
  AdsMetrics,
  AdsPlatformData,
  AdsTotals,
  DateRange,
  Ga4Data,
  Ga4Totals,
  GoogleAdsBreakdown,
  MetaBreakdown,
} from "../types";

/**
 * Dados FICTÍCIOS para testar o fluxo sem credenciais (DEMO_MODE=true).
 * Determinísticos por conta + data: gerar de novo o mesmo período dá os mesmos números.
 */

function seeded(seedText: string) {
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i++) h = Math.imul(h ^ seedText.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function dayFactor(id: string, date: string) {
  const r = seeded(`${id}:${date}`)();
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  const weekend = dow === 0 || dow === 6 ? 0.8 : 1;
  return (0.75 + r * 0.5) * weekend;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function adsSeries(id: string, range: DateRange, base: { spend: number; cpm: number; ctr: number; cvr: number }) {
  return eachDay(range).map((date) => {
    const f = dayFactor(id, date);
    const spend = r2(base.spend * f);
    const impressions = Math.round((spend / base.cpm) * 1000);
    const clicks = Math.round(impressions * base.ctr * (0.9 + dayFactor(id + "c", date) * 0.2));
    const conversions = Math.round(clicks * base.cvr * (0.8 + dayFactor(id + "v", date) * 0.4));
    return { date, spend, impressions, clicks, conversions };
  });
}

function sum(rows: { spend: number; impressions: number; clicks: number; conversions: number }[]): AdsTotals {
  return rows.reduce<AdsTotals>(
    (a, r) => ({
      spend: r2(a.spend + r.spend),
      impressions: a.impressions + r.impressions,
      clicks: a.clicks + r.clicks,
      conversions: a.conversions + r.conversions,
      conversionValue: 0,
    }),
    { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0 },
  );
}

function campaigns(id: string, totals: AdsTotals, names: string[]) {
  const rand = seeded(`${id}:camp`);
  const weights = names.map(() => 0.4 + rand());
  const total = weights.reduce((a, b) => a + b, 0);
  return names
    .map((name, i) => {
      const w = weights[i] / total;
      const cvrJitter = 0.7 + rand() * 0.6;
      return {
        id: `${i + 1}`,
        name,
        spend: r2(totals.spend * w),
        impressions: Math.round(totals.impressions * w),
        clicks: Math.round(totals.clicks * w),
        conversions: Math.round(totals.conversions * w * cvrJitter),
        conversionValue: 0,
      };
    })
    .sort((a, b) => b.spend - a.spend);
}

export function demoMeta(accountId: string, conversionAction: string, range: DateRange, prev: DateRange): AdsPlatformData {
  const base = { spend: 180, cpm: 22, ctr: 0.012, cvr: 0.07 };
  const daily = adsSeries(`meta${accountId}`, range, base);
  const totals = sum(daily);
  const previousTotals = sum(adsSeries(`meta${accountId}`, prev, { ...base, spend: base.spend * 0.92 }));
  totals.reach = Math.round(totals.impressions / 2.3);
  previousTotals.reach = Math.round(previousTotals.impressions / 2.2);
  const metaCampaigns = campaigns(`meta${accountId}`, totals, [
    "[Leads] Formulário instantâneo — Público amplo",
    "[Leads] Lookalike 1% clientes",
    "[Remarketing] Visitantes 30 dias",
    "[Mensagens] WhatsApp — Região",
  ]);
  return {
    accountId,
    currency: "BRL",
    conversionLabel: conversionAction,
    totals,
    previousTotals,
    daily,
    campaigns: metaCampaigns,
    metaBreakdown: demoMetaBreakdown(`meta${accountId}`, metaCampaigns),
  };
}

/** Imagem fictícia (SVG) para a prévia dos criativos no modo demonstração. */
function demoImage(text: string, hue: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},70%,45%)"/><stop offset="1" stop-color="hsl(${(hue + 60) % 360},70%,30%)"/></linearGradient></defs><rect width="400" height="400" fill="url(#g)"/><text x="200" y="210" font-family="Arial" font-size="34" font-weight="700" fill="#fff" text-anchor="middle">${text}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function demoMetaBreakdown(id: string, campaignRows: AdsCampaignRow[]): MetaBreakdown {
  const rand = seeded(`${id}:metabreak`);
  const out: MetaBreakdown = { adSets: [], ads: [], notes: [] };
  const setNames = ["Público amplo 25-55", "Interesse: odontologia estética", "Lookalike 1%", "Raio 10 km"];
  const adNames = ["Vídeo depoimento", "Carrossel antes e depois", "Imagem oferta avaliação", "Reels sorriso"];
  let n = 0;
  campaignRows.forEach((c, ci) => {
    split(c, 2, rand).forEach((sm, si) => {
      const set = { id: `${c.id}-s${si}`, campaignId: c.id, name: setNames[(ci + si) % setNames.length], ...sm };
      out.adSets.push(set);
      split(set, 3, rand).forEach((am, ai) => {
        const name = adNames[(ci + si + ai) % adNames.length];
        out.ads.push({
          id: `${set.id}-a${ai}`, campaignId: c.id, adSetId: set.id, name: `${name} ${ai + 1}`, ...am,
          creative: {
            thumbnail: demoImage(name.split(" ")[0], (n++ * 47) % 360),
            image: demoImage(name, (n * 47) % 360),
            title: "Avaliação gratuita com especialista",
            body: "Agende sua avaliação e conheça os tratamentos da clínica. Parcelamos em até 12x.",
            previewLink: null,
          },
        });
      });
    });
  });
  return out;
}

/** Divide as métricas de "parent" em partes com pesos aleatórios (determinísticos). */
function split(parent: AdsMetrics, n: number, rand: () => number): AdsMetrics[] {
  const w = Array.from({ length: n }, () => 0.2 + rand() ** 2);
  const total = w.reduce((a, b) => a + b, 0);
  return w.map((x) => {
    const f = x / total;
    const j = 0.6 + rand() * 0.8;
    return {
      spend: r2(parent.spend * f),
      impressions: Math.round(parent.impressions * f),
      clicks: Math.round(parent.clicks * f),
      conversions: Math.round(parent.conversions * f * j),
      conversionValue: r2(parent.conversionValue * f * j),
    };
  });
}

const DEMO_GROUPS: Record<string, { name: string; keywords: [string, string][] }[]> = {
  "Pesquisa — Marca": [
    { name: "Marca — termos exatos", keywords: [["superdental", "EXACT"], ["super dental clínica", "PHRASE"]] },
    { name: "Marca + cidade", keywords: [["superdental perto de mim", "PHRASE"], ["superdental unidade", "BROAD"]] },
  ],
  "Pesquisa — Serviços principais": [
    { name: "Implante dentário", keywords: [["implante dentário", "PHRASE"], ["implante dentário preço", "EXACT"], ["quanto custa implante", "BROAD"]] },
    { name: "Ortodontia / aparelho", keywords: [["aparelho ortodôntico", "PHRASE"], ["alinhador invisível", "BROAD"], ["aparelho dental preço", "EXACT"]] },
    { name: "Clareamento", keywords: [["clareamento dental", "PHRASE"], ["clareamento a laser", "BROAD"]] },
  ],
  "Display — Remarketing": [{ name: "Visitantes 30 dias", keywords: [] }],
};

const TERM_VARIANTS = ["", " preço", " perto de mim", " valor", " em promoção", " parcelado"];

function demoBreakdown(id: string, campaignRows: AdsCampaignRow[]): GoogleAdsBreakdown {
  const rand = seeded(`${id}:breakdown`);
  const out: GoogleAdsBreakdown = { adGroups: [], keywords: [], searchTerms: [], notes: [] };
  let gid = 100;
  let kid = 1000;
  for (const c of campaignRows) {
    const groups = DEMO_GROUPS[c.name];
    if (!groups) continue; // Performance Max não tem grupos/palavras-chave
    split(c, groups.length, rand).forEach((gm, gi) => {
      const g = { id: String(gid++), campaignId: c.id, name: groups[gi].name, ...gm };
      out.adGroups.push(g);
      const kws = groups[gi].keywords;
      if (!kws.length) return;
      split(g, kws.length, rand).forEach((km, ki) => {
        const [text, matchType] = kws[ki];
        out.keywords.push({ id: String(kid++), campaignId: c.id, adGroupId: g.id, text, matchType, ...km });
        const nTerms = matchType === "EXACT" ? 1 : 2 + Math.floor(rand() * 3);
        split(km, nTerms, rand).forEach((tm, ti) => {
          out.searchTerms.push({
            campaignId: c.id,
            adGroupId: g.id,
            term: `${text.replace(" preço", "")}${TERM_VARIANTS[ti % TERM_VARIANTS.length]}`,
            keyword: text,
            matchType,
            ...tm,
          });
        });
      });
    });
  }
  out.searchTerms.sort((a, b) => b.spend - a.spend);
  return out;
}

export function demoGoogleAds(customerId: string, range: DateRange, prev: DateRange): AdsPlatformData {
  const base = { spend: 140, cpm: 65, ctr: 0.045, cvr: 0.09 };
  const daily = adsSeries(`gads${customerId}`, range, base);
  const totals = sum(daily);
  // Valor de conversão fictício (ticket médio) para o ROAS aparecer na demonstração.
  totals.conversionValue = r2(totals.conversions * 380);
  const previousTotals = sum(adsSeries(`gads${customerId}`, prev, { ...base, spend: base.spend * 1.05 }));
  previousTotals.conversionValue = r2(previousTotals.conversions * 360);
  const campaignRows = campaigns(`gads${customerId}`, totals, [
    "Pesquisa — Marca",
    "Pesquisa — Serviços principais",
    "Performance Max — Conversões",
    "Display — Remarketing",
  ]).map((c) => ({ ...c, conversionValue: r2(c.conversions * 380) }));
  return {
    accountId: customerId,
    currency: "BRL",
    conversionLabel: "Conversões (Google Ads)",
    totals,
    previousTotals,
    daily,
    campaigns: campaignRows,
    breakdown: demoBreakdown(`gads${customerId}`, campaignRows),
  };
}

export function demoGa4(propertyId: string, range: DateRange, prev: DateRange): Ga4Data {
  const id = `ga4${propertyId}`;
  const series = (r: DateRange, scale: number) =>
    eachDay(r).map((date) => {
      const sessions = Math.round(420 * scale * dayFactor(id, date));
      return { date, sessions, totalUsers: Math.round(sessions * 0.78), keyEvents: Math.round(sessions * 0.024) };
    });
  const totals = (rows: ReturnType<typeof series>): Ga4Totals => {
    const sessions = rows.reduce((a, r) => a + r.sessions, 0);
    const totalUsers = rows.reduce((a, r) => a + r.totalUsers, 0);
    return {
      sessions,
      totalUsers,
      newUsers: Math.round(totalUsers * 0.71),
      engagedSessions: Math.round(sessions * 0.58),
      keyEvents: rows.reduce((a, r) => a + r.keyEvents, 0),
      totalRevenue: 0,
    };
  };
  const daily = series(range, 1);
  const t = totals(daily);
  const shares: [string, number, number][] = [
    ["Paid Social", 0.34, 0.52],
    ["Paid Search", 0.24, 0.64],
    ["Organic Search", 0.21, 0.61],
    ["Direct", 0.13, 0.55],
    ["Referral", 0.05, 0.6],
    ["Organic Social", 0.03, 0.48],
  ];
  return {
    propertyId,
    totals: t,
    previousTotals: totals(series(prev, 0.94)),
    daily,
    channels: shares.map(([channel, share, engagementRate]) => ({
      channel,
      sessions: Math.round(t.sessions * share),
      totalUsers: Math.round(t.totalUsers * share),
      keyEvents: Math.round(t.keyEvents * share),
      engagementRate,
    })),
  };
}
