import "server-only";
import { env } from "../env";
import { googleRefreshToken } from "../integrations";
import { PlatformError, fetchJson } from "./http";

/**
 * Troca o refresh token por um access token (OAuth 2.0 do Google).
 * Docs: https://developers.google.com/identity/protocols/oauth2/web-server#offline
 * O refresh token vem da tela de Integrações (criptografado no banco) ou do .env.
 */

let cache: { refresh: string; token: string; expiresAt: number } | undefined;

export function clearGoogleTokenCache(): void {
  cache = undefined;
}

export async function googleAccessToken(platform: string): Promise<string> {
  const e = env();
  const refresh = await googleRefreshToken();
  if (!e.GOOGLE_CLIENT_ID || !e.GOOGLE_CLIENT_SECRET) {
    throw new PlatformError(platform, "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET não configurados no servidor.");
  }
  if (!refresh) throw new PlatformError(platform, "Google não conectado. Um admin deve conectar em Integrações.");

  if (cache && cache.refresh === refresh && cache.expiresAt > Date.now() + 60_000) return cache.token;

  const res = await fetchJson<{ access_token: string; expires_in: number }>(
    platform,
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: e.GOOGLE_CLIENT_ID,
        client_secret: e.GOOGLE_CLIENT_SECRET,
        refresh_token: refresh,
        grant_type: "refresh_token",
      }),
    },
  );

  cache = { refresh, token: res.access_token, expiresAt: Date.now() + res.expires_in * 1000 };
  return res.access_token;
}
