import "server-only";
import { env } from "../env";
import { googleAccessToken } from "./google-oauth";
import { appSecretProof, metaCredentials } from "./meta";
import { PlatformError, fetchJson } from "./http";

/**
 * Lista as contas que a conexão enxerga, para escolher os IDs dos clientes sem digitar.
 * Meta:       GET /me/adaccounts                      (https://developers.facebook.com/docs/marketing-api/reference/user/adaccounts)
 * Google Ads: customer_client do MCC ou listAccessibleCustomers
 * GA4:        Admin API accountSummaries              (https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1beta/accountSummaries/list)
 */

export interface AccountOption {
  id: string;
  name: string;
  detail?: string;
}

export type Discovery<T> = { ok: true; items: T[] } | { ok: false; error: string };

const TTL = 10 * 60_000;
const cache = new Map<string, { at: number; value: Promise<Discovery<AccountOption>> }>();

function cached(key: string, fn: () => Promise<AccountOption[]>, force: boolean): Promise<Discovery<AccountOption>> {
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < TTL) return hit.value;
  const value = fn()
    .then((items) => ({ ok: true as const, items }))
    .catch((err) => {
      cache.delete(key);
      return { ok: false as const, error: err instanceof PlatformError ? err.message : "Erro inesperado." };
    });
  cache.set(key, { at: Date.now(), value });
  return value;
}

export function clearDiscoveryCache(): void {
  cache.clear();
}

/* ---------- Meta ---------- */
interface MetaAdAccount {
  account_id: string;
  name: string;
  currency: string;
  account_status: number;
  business?: { name?: string };
}

export function metaAdAccounts(force = false) {
  return cached("meta", async () => {
    const { token, secret, version } = await metaCredentials();
    const q = new URLSearchParams({ fields: "account_id,name,currency,account_status,business{name}", limit: "200" });
    const proof = appSecretProof(token, secret);
    if (proof) q.set("appsecret_proof", proof);
    let url: string | undefined = `https://graph.facebook.com/${version}/me/adaccounts?${q}`;
    const out: MetaAdAccount[] = [];
    for (let page = 0; url && page < 10; page++) {
      const res: { data?: MetaAdAccount[]; paging?: { next?: string } } = await fetchJson("Meta Ads", url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      out.push(...(res.data ?? []));
      url = res.paging?.next;
    }
    return out
      .map((a) => ({
        id: a.account_id,
        name: a.name,
        detail: [a.business?.name, a.currency, a.account_status === 1 ? null : "inativa"].filter(Boolean).join(" · "),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, force);
}

/* ---------- Google Ads ---------- */
export function googleAdsAccounts(force = false) {
  return cached("gads", async () => {
    const e = env();
    if (!e.GOOGLE_ADS_DEVELOPER_TOKEN) throw new PlatformError("Google Ads", "GOOGLE_ADS_DEVELOPER_TOKEN não configurado.");
    const token = await googleAccessToken("Google Ads");
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "developer-token": e.GOOGLE_ADS_DEVELOPER_TOKEN,
    };
    const base = `https://googleads.googleapis.com/${e.GOOGLE_ADS_API_VERSION}`;
    const mcc = e.GOOGLE_ADS_LOGIN_CUSTOMER_ID;

    if (mcc) {
      const res: { results?: { customerClient: { id: string; descriptiveName?: string; manager?: boolean; status?: string; currencyCode?: string } }[] } =
        await fetchJson("Google Ads", `${base}/customers/${mcc}/googleAds:search`, {
          method: "POST",
          headers: { ...headers, "login-customer-id": mcc, "Content-Type": "application/json" },
          body: JSON.stringify({
            query:
              "SELECT customer_client.id, customer_client.descriptive_name, customer_client.manager, " +
              "customer_client.status, customer_client.currency_code FROM customer_client WHERE customer_client.manager = FALSE",
          }),
        });
      return (res.results ?? [])
        .map(({ customerClient: c }) => ({
          id: String(c.id),
          name: c.descriptiveName ?? "(sem nome)",
          detail: [c.currencyCode, c.status && c.status !== "ENABLED" ? c.status.toLowerCase() : null].filter(Boolean).join(" · "),
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    }

    const res: { resourceNames?: string[] } = await fetchJson("Google Ads", `${base}/customers:listAccessibleCustomers`, { headers });
    return (res.resourceNames ?? []).map((r) => {
      const id = r.replace("customers/", "");
      return { id, name: id, detail: "defina GOOGLE_ADS_LOGIN_CUSTOMER_ID para ver os nomes" };
    });
  }, force);
}

/* ---------- GA4 ---------- */
export function ga4Properties(force = false) {
  return cached("ga4", async () => {
    const token = await googleAccessToken("Google Analytics 4");
    const out: AccountOption[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < 10; page++) {
      const url = new URL("https://analyticsadmin.googleapis.com/v1beta/accountSummaries");
      url.searchParams.set("pageSize", "200");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const res: {
        accountSummaries?: { displayName: string; propertySummaries?: { property: string; displayName: string }[] }[];
        nextPageToken?: string;
      } = await fetchJson("Google Analytics 4", url.toString(), { headers: { Authorization: `Bearer ${token}` } });
      for (const acc of res.accountSummaries ?? []) {
        for (const p of acc.propertySummaries ?? []) {
          out.push({ id: p.property.replace("properties/", ""), name: p.displayName, detail: acc.displayName });
        }
      }
      pageToken = res.nextPageToken;
      if (!pageToken) break;
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, force);
}
