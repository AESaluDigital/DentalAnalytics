import "server-only";
import { env } from "../env";
import { googleAccessToken } from "./google-oauth";
import { appSecretProof, metaCredentials } from "./meta";
import { PlatformError, fetchJson } from "./http";

/**
 * Lista as contas que a conexão enxerga, para escolher os IDs dos clientes sem digitar.
 * Meta:       portfólios (/me/businesses) → contas próprias e compartilhadas, mais /me/adaccounts
 * Google Ads: customer_client do MCC ou listAccessibleCustomers
 * GA4:        Admin API accountSummaries              (https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1beta/accountSummaries/list)
 */

export interface AccountOption {
  id: string;
  name: string;
  detail?: string;
  /** Agrupamento da conta (ex.: portfólio/Business Manager da Meta). */
  group?: string;
  groupId?: string;
}

export type Discovery<T> = { ok: true; items: T[]; notice?: string } | { ok: false; error: string };

type Found = AccountOption[] | { items: AccountOption[]; notice?: string };

const TTL = 10 * 60_000;
const cache = new Map<string, { at: number; value: Promise<Discovery<AccountOption>> }>();

function cached(key: string, fn: () => Promise<Found>, force: boolean): Promise<Discovery<AccountOption>> {
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < TTL) return hit.value;
  const value = fn()
    .then((r): Discovery<AccountOption> => (Array.isArray(r) ? { ok: true, items: r } : { ok: true, ...r }))
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
/**
 * Contas de anúncio que o perfil conectado gerencia, agrupadas por portfólio (Business Manager):
 * - GET /me/businesses                    portfólios do perfil (precisa de business_management)
 * - GET /{business}/owned_ad_accounts     contas do próprio portfólio
 * - GET /{business}/client_ad_accounts    contas de clientes compartilhadas com o portfólio
 * - GET /me/adaccounts                    contas com acesso direto (pega o que sobrar)
 * https://developers.facebook.com/docs/marketing-api/business-asset-management
 */
interface MetaAdAccount {
  account_id: string;
  name: string;
  currency: string;
  account_status: number;
  business?: { id?: string; name?: string };
}

const META_STATUS: Record<number, string> = {
  2: "desativada",
  3: "pagamento pendente",
  7: "em análise",
  8: "pendente de liquidação",
  9: "em período de carência",
  100: "pendente de encerramento",
  101: "encerrada",
};

async function metaPaged<T>(path: string, params: Record<string, string>): Promise<T[]> {
  const { token, secret, version } = await metaCredentials();
  const q = new URLSearchParams({ limit: "200", ...params });
  const proof = appSecretProof(token, secret);
  if (proof) q.set("appsecret_proof", proof);
  let url: string | undefined = `https://graph.facebook.com/${version}/${path}?${q}`;
  const out: T[] = [];
  for (let page = 0; url && page < 20; page++) {
    const res: { data?: T[]; paging?: { next?: string } } = await fetchJson("Meta Ads", url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    out.push(...(res.data ?? []));
    url = res.paging?.next;
  }
  return out;
}

const META_ACCOUNT_FIELDS = "account_id,name,currency,account_status";
export const META_NO_PORTFOLIO = "Sem portfólio (acesso direto)";

/** Rank: conta própria de um portfólio (3) > compartilhada com o portfólio (2) > acesso direto sem portfólio (1). */
type Ranked = AccountOption & { rank: number };

export function metaAdAccounts(force = false) {
  return cached("meta", async () => {
    const byId = new Map<string, Ranked>();
    const add = (a: MetaAdAccount, rank: number, group: string, groupId?: string) => {
      const prev = byId.get(a.account_id);
      if (prev && prev.rank >= rank) return;
      const status = a.account_status === 1 ? null : (META_STATUS[a.account_status] ?? "inativa");
      byId.set(a.account_id, {
        id: a.account_id,
        name: a.name || "(sem nome)",
        group,
        groupId,
        rank,
        detail: [rank === 2 ? "compartilhada com o portfólio" : null, a.currency, status].filter(Boolean).join(" · "),
      });
    };

    let notice: string | undefined;
    let businesses: { id: string; name: string }[] = [];
    try {
      businesses = await metaPaged<{ id: string; name: string }>("me/businesses", { fields: "id,name" });
    } catch (err) {
      if (err instanceof PlatformError && err.status === 429) throw err;
      notice =
        "Não foi possível ler os portfólios (Business Manager): " +
        (err instanceof PlatformError ? err.message : "erro inesperado") +
        ". Reconecte a Meta aceitando a permissão business_management para ver todas as contas dos portfólios.";
    }

    for (const b of businesses) {
      const [owned, client] = await Promise.all([
        metaPaged<MetaAdAccount>(`${b.id}/owned_ad_accounts`, { fields: META_ACCOUNT_FIELDS }).catch(() => []),
        metaPaged<MetaAdAccount>(`${b.id}/client_ad_accounts`, { fields: META_ACCOUNT_FIELDS }).catch(() => []),
      ]);
      owned.forEach((a) => add(a, 3, b.name, b.id));
      client.forEach((a) => add(a, 2, b.name, b.id));
    }

    const direct = await metaPaged<MetaAdAccount>("me/adaccounts", { fields: `${META_ACCOUNT_FIELDS},business{id,name}` });
    for (const a of direct) {
      if (a.business?.id) add(a, 3, a.business.name ?? a.business.id, a.business.id);
      else add(a, 1, META_NO_PORTFOLIO);
    }

    const items = [...byId.values()]
      .map(({ rank: _rank, ...a }): AccountOption => a)
      .sort(
        (a, b) =>
          Number(a.group === META_NO_PORTFOLIO) - Number(b.group === META_NO_PORTFOLIO) ||
          (a.group ?? "").localeCompare(b.group ?? "", "pt-BR") ||
          a.name.localeCompare(b.name, "pt-BR"),
      );
    return { items, notice };
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
