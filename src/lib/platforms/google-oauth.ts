import "server-only";
import { env } from "../env";
import { PlatformError, fetchJson } from "./http";

/**
 * Troca o refresh token por um access token (OAuth 2.0 do Google).
 * Docs: https://developers.google.com/identity/protocols/oauth2/web-server#offline
 */

let cache: { token: string; expiresAt: number } | undefined;

export async function googleAccessToken(platform: string): Promise<string> {
  if (cache && cache.expiresAt > Date.now() + 60_000) return cache.token;

  const e = env();
  if (!e.GOOGLE_CLIENT_ID || !e.GOOGLE_CLIENT_SECRET || !e.GOOGLE_REFRESH_TOKEN) {
    throw new PlatformError(platform, "Credenciais OAuth do Google não configuradas no servidor.");
  }

  const res = await fetchJson<{ access_token: string; expires_in: number }>(
    platform,
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: e.GOOGLE_CLIENT_ID,
        client_secret: e.GOOGLE_CLIENT_SECRET,
        refresh_token: e.GOOGLE_REFRESH_TOKEN,
        grant_type: "refresh_token",
      }),
    },
  );

  cache = { token: res.access_token, expiresAt: Date.now() + res.expires_in * 1000 };
  return res.access_token;
}
