import "server-only";
import { buildReportData } from "./build";
import { sellbotStamp } from "../platforms/sellbot";
import type { ClientRow, DateRange, ReportData } from "../types";

/**
 * Dados ao vivo para o dashboard. Um cache curto em memória evita estourar limites
 * das APIs quando várias pessoas abrem o mesmo cliente/período; "Atualizar agora" ignora o cache.
 */
const TTL_MS = 3 * 60_000;
const MAX_ENTRIES = 200;
const cache = new Map<string, { at: number; data: Promise<ReportData> }>();

export async function getLiveData(
  client: ClientRow,
  range: DateRange,
  force = false,
): Promise<{ data: ReportData; fetchedAt: number }> {
  const key = [client.id, client.meta_ad_account_id, client.meta_conversion_action, client.google_ads_customer_id,
    client.ga4_property_id, range.start, range.end, await sellbotStamp(client.id)].join("|");
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < TTL_MS) {
    return { data: await hit.data, fetchedAt: hit.at };
  }

  const at = Date.now();
  const promise = buildReportData(client, range);
  cache.set(key, { at, data: promise });
  if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!);

  const data = await promise;
  // Falhas não ficam em cache: a próxima abertura tenta de novo.
  if ([data.meta, data.googleAds, data.ga4, data.sellbot].some((r) => r?.status === "error")) cache.delete(key);
  return { data, fetchedAt: at };
}

/** Limpa o cache de um cliente (ex.: depois de conectar/alterar a Sellbot). */
export function clearLiveCache(clientId: number): void {
  for (const k of cache.keys()) if (k.startsWith(`${clientId}|`)) cache.delete(k);
}
