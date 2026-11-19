/**
 * Testa as credenciais do .env e lista as contas acessíveis (com os IDs para cadastrar clientes).
 * Uso: npm run check:credentials
 * Nunca imprime tokens.
 */
import { createHmac } from "node:crypto";

const env = (k: string) => process.env[k]?.trim() || undefined;

async function getJson(url: string, init: RequestInit = {}) {
  const res = await fetch(url, init);
  const text = await res.text();
  let body: any;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text.slice(0, 200) };
  }
  if (!res.ok) {
    const first = Array.isArray(body) ? body[0] : body;
    throw new Error(first?.error?.message ?? first?.error_description ?? `HTTP ${res.status}`);
  }
  return body;
}

function section(title: string) {
  console.log(`\n=== ${title} ===`);
}

/* ---------------- Meta ---------------- */
async function checkMeta() {
  section("Meta Ads");
  const token = env("META_ACCESS_TOKEN");
  if (!token) return console.log("✗ META_ACCESS_TOKEN vazio");
  const version = env("META_API_VERSION") ?? "v26.0";
  const secret = env("META_APP_SECRET");
  const proof = secret ? `&appsecret_proof=${createHmac("sha256", secret).update(token).digest("hex")}` : "";
  const headers = { Authorization: `Bearer ${token}` };

  try {
    const me = await getJson(`https://graph.facebook.com/${version}/me?fields=id,name${proof}`, { headers });
    console.log(`✓ Token válido — ${me.name} (${me.id})`);
    let url: string | undefined =
      `https://graph.facebook.com/${version}/me/adaccounts?fields=account_id,name,currency,account_status&limit=200${proof}`;
    const accounts: any[] = [];
    while (url) {
      const page: any = await getJson(url, { headers });
      accounts.push(...(page.data ?? []));
      url = page.paging?.next;
    }
    if (!accounts.length) console.log("  Nenhuma conta de anúncios atribuída a este token.");
    for (const a of accounts) {
      const status = a.account_status === 1 ? "" : " [inativa]";
      console.log(`  ${a.account_id.padEnd(18)} ${a.name} (${a.currency})${status}`);
    }
  } catch (e) {
    console.log(`✗ ${(e as Error).message}`);
  }
}

/* ---------------- Google ---------------- */
async function googleToken(): Promise<string | undefined> {
  const id = env("GOOGLE_CLIENT_ID");
  const secret = env("GOOGLE_CLIENT_SECRET");
  const refresh = env("GOOGLE_REFRESH_TOKEN");
  if (!id || !secret) {
    console.log("✗ GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET vazios");
    return;
  }
  if (!refresh) {
    console.log("✗ GOOGLE_REFRESH_TOKEN vazio — rode: npm run google:auth");
    return;
  }
  try {
    const body = await getJson("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refresh, grant_type: "refresh_token" }),
    });
    console.log("✓ OAuth do Google OK");
    return body.access_token as string;
  } catch (e) {
    console.log(`✗ OAuth do Google: ${(e as Error).message}`);
  }
}

async function checkGoogleAds(token: string) {
  section("Google Ads");
  const dev = env("GOOGLE_ADS_DEVELOPER_TOKEN");
  if (!dev) return console.log("✗ GOOGLE_ADS_DEVELOPER_TOKEN vazio");
  const version = env("GOOGLE_ADS_API_VERSION") ?? "v26";
  const mcc = env("GOOGLE_ADS_LOGIN_CUSTOMER_ID");
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, "developer-token": dev };

  try {
    if (mcc) {
      const res = await getJson(`https://googleads.googleapis.com/${version}/customers/${mcc}/googleAds:search`, {
        method: "POST",
        headers: { ...headers, "login-customer-id": mcc, "Content-Type": "application/json" },
        body: JSON.stringify({
          query:
            "SELECT customer_client.id, customer_client.descriptive_name, customer_client.manager, customer_client.status " +
            "FROM customer_client WHERE customer_client.level <= 1",
        }),
      });
      console.log(`✓ MCC ${mcc} acessível. Contas:`);
      for (const r of res.results ?? []) {
        const c = r.customerClient;
        if (c.manager) continue;
        const status = c.status === "ENABLED" ? "" : ` [${c.status}]`;
        console.log(`  ${String(c.id).padEnd(12)} ${c.descriptiveName ?? "(sem nome)"}${status}`);
      }
    } else {
      const res = await getJson(`https://googleads.googleapis.com/${version}/customers:listAccessibleCustomers`, { headers });
      console.log("✓ Contas acessíveis diretamente (defina GOOGLE_ADS_LOGIN_CUSTOMER_ID se usar MCC):");
      for (const name of res.resourceNames ?? []) console.log(`  ${String(name).replace("customers/", "")}`);
    }
  } catch (e) {
    console.log(`✗ ${(e as Error).message}`);
  }
}

async function checkGa4(token: string) {
  section("Google Analytics 4");
  try {
    const summaries: any[] = [];
    let pageToken: string | undefined;
    do {
      const url = new URL("https://analyticsadmin.googleapis.com/v1beta/accountSummaries");
      url.searchParams.set("pageSize", "200");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const res = await getJson(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
      summaries.push(...(res.accountSummaries ?? []));
      pageToken = res.nextPageToken;
    } while (pageToken);
    console.log("✓ Acesso ao GA4 OK. Propriedades:");
    for (const acc of summaries) {
      for (const p of acc.propertySummaries ?? []) {
        console.log(`  ${String(p.property).replace("properties/", "").padEnd(12)} ${p.displayName}  (conta: ${acc.displayName})`);
      }
    }
    if (!summaries.length) console.log("  Nenhuma propriedade visível para esta conta Google.");
  } catch (e) {
    console.log(`✗ ${(e as Error).message}`);
    console.log("  (Ative a 'Google Analytics Admin API' e a 'Google Analytics Data API' no projeto do Google Cloud.)");
  }
}

/* ---------------- Claude ---------------- */
function checkAnthropic() {
  section("Claude (textos de análise)");
  console.log(env("ANTHROPIC_API_KEY") ? "✓ ANTHROPIC_API_KEY preenchida" : "– ANTHROPIC_API_KEY vazia (relatórios sem texto de análise)");
}

async function main() {
  await checkMeta();
  section("Google OAuth");
  const token = await googleToken();
  if (token) {
    await checkGoogleAds(token);
    await checkGa4(token);
  }
  checkAnthropic();
  if (env("DEMO_MODE") === "true") console.log("\n⚠ DEMO_MODE=true: mude para false no .env e reinicie o npm run dev para usar dados reais.");
}

main();
