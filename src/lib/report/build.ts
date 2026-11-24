import "server-only";
import { previousRange } from "../dates";
import { fetchMeta } from "../platforms/meta";
import { fetchGoogleAds } from "../platforms/google-ads";
import { fetchGa4 } from "../platforms/ga4";
import { fetchSellbotForClient } from "../platforms/sellbot";
import { PlatformError } from "../platforms/http";
import { demoGa4, demoGoogleAds, demoMeta } from "../platforms/demo";
import { env } from "../env";
import type { ClientRow, DateRange, PlatformResult, ReportData, SellbotData } from "../types";

async function settle<T>(id: string | null, fn: (id: string) => Promise<T>): Promise<PlatformResult<T>> {
  if (!id) return { status: "not_configured" };
  try {
    return { status: "ok", data: await fn(id) };
  } catch (err) {
    const message =
      err instanceof PlatformError ? `${err.platform}: ${err.message}` : "Erro inesperado ao consultar a plataforma.";
    if (!(err instanceof PlatformError)) console.error("[report] erro inesperado", err);
    return { status: "error", message };
  }
}

/** Sellbot: só quando o cliente tem conta conectada. */
async function sellbotResult(clientId: number, range: DateRange, prev: DateRange): Promise<PlatformResult<SellbotData>> {
  try {
    const data = await fetchSellbotForClient(clientId, range, prev);
    return data ? { status: "ok", data } : { status: "not_configured" };
  } catch (err) {
    if (!(err instanceof PlatformError)) console.error("[report] erro inesperado na Sellbot", err);
    return { status: "error", message: err instanceof PlatformError ? `Sellbot: ${err.message}` : "Erro inesperado ao consultar a Sellbot." };
  }
}

/** Busca os dados de todas as plataformas configuradas para o cliente, em paralelo. */
export async function buildReportData(client: ClientRow, range: DateRange): Promise<ReportData> {
  const prev = previousRange(range);
  const demo = env().DEMO_MODE === "true";

  const [meta, googleAds, ga4, sellbot] = await Promise.all([
    settle(client.meta_ad_account_id, async (id) =>
      demo ? demoMeta(id, client.meta_conversion_action, range, prev) : fetchMeta(id, client.meta_conversion_action, range, prev),
    ),
    settle(client.google_ads_customer_id, async (id) =>
      demo ? demoGoogleAds(id, range, prev) : fetchGoogleAds(id, range, prev),
    ),
    settle(client.ga4_property_id, async (id) => (demo ? demoGa4(id, range, prev) : fetchGa4(id, range, prev))),
    sellbotResult(client.id, range, prev),
  ]);

  return {
    version: 1,
    ...(demo ? { demo: true } : {}),
    generatedAt: new Date().toISOString(),
    client: { id: client.id, name: client.name },
    range,
    previousRange: prev,
    meta,
    googleAds,
    ga4,
    sellbot,
  };
}
