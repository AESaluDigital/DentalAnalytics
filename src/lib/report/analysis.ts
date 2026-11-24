import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { env } from "../env";
import { adsKpis, delta } from "../metrics";
import type { AdsPlatformData, Ga4Data, ReportAnalysis, ReportData } from "../types";

/**
 * Claude é usado SOMENTE para o texto de análise. Números, gráficos e tabelas vêm do template.
 * Envia um resumo enxuto (totais, KPIs, top campanhas/canais) — sem dados pessoais nem IDs de conta.
 */

const AnalysisSchema = z.object({
  resumo: z.string(),
  destaques: z.array(z.string()),
  pontos_de_atencao: z.array(z.string()),
  recomendacoes: z.array(z.string()),
  por_canal: z.array(z.object({ canal: z.enum(["meta", "google_ads", "ga4"]), analise: z.string() })),
});

const JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["resumo", "destaques", "pontos_de_atencao", "recomendacoes", "por_canal"],
  properties: {
    resumo: { type: "string", description: "Parágrafo executivo de 3 a 5 frases." },
    destaques: { type: "array", items: { type: "string" }, description: "2 a 4 resultados positivos." },
    pontos_de_atencao: { type: "array", items: { type: "string" }, description: "1 a 4 riscos ou quedas." },
    recomendacoes: { type: "array", items: { type: "string" }, description: "2 a 4 ações práticas." },
    por_canal: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["canal", "analise"],
        properties: {
          canal: { type: "string", enum: ["meta", "google_ads", "ga4"] },
          analise: { type: "string", description: "2 a 3 frases sobre o canal." },
        },
      },
    },
  },
} as const;

const SYSTEM = `Você é analista sênior de mídia paga e analytics de uma agência digital brasileira.
Escreva em português do Brasil, tom profissional e direto, para o cliente final ler.
Use somente os números fornecidos; nunca invente valores, metas ou benchmarks.
Variações são em relação ao período anterior de mesma duração. Valores monetários estão na moeda indicada.
Inclua em "por_canal" apenas os canais presentes nos dados.
Se um canal tiver volume muito baixo, diga isso em vez de tirar conclusões fortes.`;

const round = (n: number | null, d = 2) => (n === null ? null : Number(n.toFixed(d)));

function adsSummary(p: AdsPlatformData) {
  const k = adsKpis(p.totals);
  const kp = adsKpis(p.previousTotals);
  return {
    moeda: p.currency,
    conversao_considerada: p.conversionLabel,
    atual: { ...p.totals, ctr: round(k.ctr, 4), cpc: round(k.cpc), cpa: round(k.cpa), roas: round(k.roas) },
    anterior: { ...p.previousTotals, ctr: round(kp.ctr, 4), cpc: round(kp.cpc), cpa: round(kp.cpa), roas: round(kp.roas) },
    variacao: {
      investimento: round(delta(p.totals.spend, p.previousTotals.spend), 3),
      conversoes: round(delta(p.totals.conversions, p.previousTotals.conversions), 3),
      cpa: round(delta(k.cpa, kp.cpa), 3),
      ctr: round(delta(k.ctr, kp.ctr), 3),
    },
    top_campanhas: p.campaigns.slice(0, 8).map((c) => ({
      nome: c.name,
      investimento: round(c.spend),
      cliques: c.clicks,
      conversoes: round(c.conversions),
      cpa: round(c.conversions > 0 ? c.spend / c.conversions : null),
    })),
  };
}

function ga4Summary(g: Ga4Data) {
  return {
    atual: g.totals,
    anterior: g.previousTotals,
    variacao: {
      sessoes: round(delta(g.totals.sessions, g.previousTotals.sessions), 3),
      usuarios: round(delta(g.totals.totalUsers, g.previousTotals.totalUsers), 3),
      eventos_chave: round(delta(g.totals.keyEvents, g.previousTotals.keyEvents), 3),
    },
    canais: g.channels.slice(0, 8).map((c) => ({
      canal: c.channel,
      sessoes: c.sessions,
      eventos_chave: c.keyEvents,
      taxa_engajamento: round(c.engagementRate, 3),
    })),
  };
}

function buildPayload(data: ReportData) {
  return {
    periodo: data.range,
    periodo_anterior: data.previousRange,
    ...(data.meta.status === "ok" ? { meta: adsSummary(data.meta.data) } : {}),
    ...(data.googleAds.status === "ok" ? { google_ads: adsSummary(data.googleAds.data) } : {}),
    ...(data.ga4.status === "ok" ? { ga4: ga4Summary(data.ga4.data) } : {}),
  };
}

export async function generateAnalysis(data: ReportData): Promise<ReportAnalysis | null> {
  const e = env();
  if (!e.ANTHROPIC_API_KEY) return null;
  if (data.meta.status !== "ok" && data.googleAds.status !== "ok" && data.ga4.status !== "ok") return null;

  // Teto de tempo: se a análise demorar, o relatório sai sem ela em vez de estourar o limite da hospedagem.
  const client = new Anthropic({ apiKey: e.ANTHROPIC_API_KEY, timeout: 120_000, maxRetries: 1 });

  try {
    const response = await client.beta.messages.create({
      model: e.ANTHROPIC_MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: JSON_SCHEMA },
      },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Dados do relatório (JSON):\n${JSON.stringify(buildPayload(data))}`,
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      console.warn("[analysis] solicitação recusada", response.stop_details?.category ?? null);
      return null;
    }
    if (response.stop_reason === "max_tokens") {
      console.warn("[analysis] resposta truncada (max_tokens)");
      return null;
    }

    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return null;

    const parsed = AnalysisSchema.safeParse(JSON.parse(text.text));
    if (!parsed.success) {
      console.warn("[analysis] JSON fora do schema", parsed.error.issues);
      return null;
    }
    return parsed.data;
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      console.warn("[analysis] limite de taxa atingido");
    } else if (err instanceof Anthropic.AuthenticationError) {
      console.error("[analysis] ANTHROPIC_API_KEY inválida");
    } else if (err instanceof Anthropic.APIError) {
      console.error(`[analysis] erro da API ${err.status}: ${err.message}`);
    } else if (err instanceof SyntaxError) {
      console.warn("[analysis] resposta não é JSON válido");
    } else {
      console.error("[analysis] erro inesperado", err);
    }
    return null;
  }
}
