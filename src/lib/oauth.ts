import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { env } from "./env";
import { fetchJson, PlatformError } from "./platforms/http";
import { appSecretProof } from "./platforms/meta";
import type { Provider } from "./integrations";

/**
 * Login oficial das plataformas (OAuth 2.0), somente leitura:
 * - Meta:   Facebook Login (https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow)
 *           permissão ads_read; token trocado por um de longa duração (≈60 dias).
 * - Google: OAuth web server + PKCE (https://developers.google.com/identity/protocols/oauth2/web-server)
 *           escopos adwords + analytics.readonly, acesso offline (refresh token).
 * Nenhuma senha passa pelo app: o login acontece na própria Meta/Google.
 */

export const META_SCOPES = ["ads_read"];
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/adwords",
  "https://www.googleapis.com/auth/analytics.readonly",
];

export function redirectUri(provider: Provider): string {
  return new URL(`/api/integrations/${provider}/callback`, env().APP_URL).toString();
}

export function isConfigured(provider: Provider): { ok: boolean; missing: string[] } {
  const e = env();
  const need: [string, string | undefined][] =
    provider === "meta"
      ? [["META_APP_ID", e.META_APP_ID], ["META_APP_SECRET", e.META_APP_SECRET], ["INTEGRATIONS_KEY", e.INTEGRATIONS_KEY]]
      : [["GOOGLE_CLIENT_ID", e.GOOGLE_CLIENT_ID], ["GOOGLE_CLIENT_SECRET", e.GOOGLE_CLIENT_SECRET], ["INTEGRATIONS_KEY", e.INTEGRATIONS_KEY]];
  const missing = need.filter(([, v]) => !v).map(([k]) => k);
  return { ok: missing.length === 0, missing };
}

export interface OAuthStart {
  url: string;
  state: string;
  verifier: string;
}

export function startUrl(provider: Provider): OAuthStart {
  const e = env();
  const state = randomBytes(24).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");

  if (provider === "meta") {
    const u = new URL(`https://www.facebook.com/${e.META_API_VERSION}/dialog/oauth`);
    u.searchParams.set("client_id", e.META_APP_ID!);
    u.searchParams.set("redirect_uri", redirectUri("meta"));
    u.searchParams.set("state", state);
    u.searchParams.set("response_type", "code");
    if (e.META_LOGIN_CONFIG_ID) u.searchParams.set("config_id", e.META_LOGIN_CONFIG_ID);
    else u.searchParams.set("scope", META_SCOPES.join(","));
    return { url: u.toString(), state, verifier };
  }

  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.search = new URLSearchParams({
    client_id: e.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri("google"),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  }).toString();
  return { url: u.toString(), state, verifier };
}

export interface OAuthResult {
  accountName: string;
  accountId: string;
  token: string;
  scopes: string[];
  expiresAt: Date | null;
}

/* ---------------- Meta ---------------- */
export async function finishMeta(code: string): Promise<OAuthResult> {
  const e = env();
  const base = `https://graph.facebook.com/${e.META_API_VERSION}`;
  const P = "Meta Ads";

  const short = await fetchJson<{ access_token: string }>(
    P,
    `${base}/oauth/access_token?${new URLSearchParams({
      client_id: e.META_APP_ID!,
      redirect_uri: redirectUri("meta"),
      client_secret: e.META_APP_SECRET!,
      code,
    })}`,
  );

  // Token de longa duração (≈60 dias): evita relogar toda hora.
  const long = await fetchJson<{ access_token: string; expires_in?: number }>(
    P,
    `${base}/oauth/access_token?${new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: e.META_APP_ID!,
      client_secret: e.META_APP_SECRET!,
      fb_exchange_token: short.access_token,
    })}`,
  );
  const token = long.access_token;
  const proof = appSecretProof(token, e.META_APP_SECRET);
  const auth = { headers: { Authorization: `Bearer ${token}` } };
  const suffix = proof ? `&appsecret_proof=${proof}` : "";

  const me = await fetchJson<{ id: string; name: string }>(P, `${base}/me?fields=id,name${suffix}`, auth);
  const perms = await fetchJson<{ data: { permission: string; status: string }[] }>(P, `${base}/me/permissions?limit=100${suffix}`, auth);
  const granted = perms.data.filter((p) => p.status === "granted").map((p) => p.permission);
  if (!granted.includes("ads_read")) {
    throw new PlatformError(P, "A permissão ads_read não foi concedida. Conecte de novo e aceite a permissão.");
  }

  return {
    accountName: me.name,
    accountId: me.id,
    token,
    scopes: granted,
    expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : null,
  };
}

export async function revokeMeta(token: string): Promise<void> {
  const e = env();
  const proof = appSecretProof(token, e.META_APP_SECRET);
  await fetch(`https://graph.facebook.com/${e.META_API_VERSION}/me/permissions${proof ? `?appsecret_proof=${proof}` : ""}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => undefined);
}

/* ---------------- Google ---------------- */
export async function finishGoogle(code: string, verifier: string): Promise<OAuthResult> {
  const e = env();
  const P = "Google";
  const tok = await fetchJson<{ access_token: string; refresh_token?: string; scope?: string }>(
    P,
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: e.GOOGLE_CLIENT_ID!,
        client_secret: e.GOOGLE_CLIENT_SECRET!,
        code,
        code_verifier: verifier,
        grant_type: "authorization_code",
        redirect_uri: redirectUri("google"),
      }),
    },
  );
  if (!tok.refresh_token) {
    throw new PlatformError(P, "O Google não devolveu acesso offline. Tente conectar de novo.");
  }
  const scopes = (tok.scope ?? "").split(" ").filter(Boolean);
  const missing = GOOGLE_SCOPES.filter((s) => s.startsWith("https://") && !scopes.includes(s));
  if (missing.length) {
    throw new PlatformError(P, "Nem todas as permissões foram concedidas (Google Ads e Analytics). Conecte de novo e marque todas.");
  }

  const info = await fetchJson<{ sub: string; email?: string; name?: string }>(
    P,
    "https://openidconnect.googleapis.com/v1/userinfo",
    { headers: { Authorization: `Bearer ${tok.access_token}` } },
  );

  return {
    accountName: info.email ?? info.name ?? "Conta Google",
    accountId: info.sub,
    token: tok.refresh_token,
    scopes,
    expiresAt: null,
  };
}

export async function revokeGoogle(refreshToken: string): Promise<void> {
  await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: refreshToken }),
  }).catch(() => undefined);
}
