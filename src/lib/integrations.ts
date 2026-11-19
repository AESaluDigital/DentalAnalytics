import "server-only";
import { query, queryOne } from "./db";
import { decryptSecret, encryptSecret } from "./crypto";
import { env } from "./env";

export type Provider = "meta" | "google";

export interface IntegrationInfo {
  provider: Provider;
  account_name: string;
  account_id: string;
  scopes: string;
  expires_at: Date | null;
  connected_at: Date;
  connected_by_name: string | null;
}

export async function listIntegrations(): Promise<IntegrationInfo[]> {
  return query<IntegrationInfo>(
    `SELECT i.provider, i.account_name, i.account_id, i.scopes, i.expires_at, i.connected_at, u.name AS connected_by_name
     FROM integrations i LEFT JOIN users u ON u.id = i.connected_by`,
  );
}

export async function saveIntegration(args: {
  provider: Provider;
  accountName: string;
  accountId: string;
  token: string;
  scopes: string[];
  expiresAt: Date | null;
  userId: number;
}): Promise<void> {
  await query(
    `INSERT INTO integrations (provider, account_name, account_id, token_encrypted, scopes, expires_at, connected_by, connected_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7, now())
     ON CONFLICT (provider) DO UPDATE SET
       account_name = EXCLUDED.account_name, account_id = EXCLUDED.account_id,
       token_encrypted = EXCLUDED.token_encrypted, scopes = EXCLUDED.scopes,
       expires_at = EXCLUDED.expires_at, connected_by = EXCLUDED.connected_by, connected_at = now()`,
    [args.provider, args.accountName, args.accountId, encryptSecret(args.token), args.scopes.join(" "), args.expiresAt, args.userId],
  );
}

export async function deleteIntegration(provider: Provider): Promise<string | null> {
  const row = await queryOne<{ token_encrypted: string }>(
    "DELETE FROM integrations WHERE provider = $1 RETURNING token_encrypted",
    [provider],
  );
  return row ? decryptSecret(row.token_encrypted) : null;
}

async function storedToken(provider: Provider): Promise<string | undefined> {
  try {
    const row = await queryOne<{ token_encrypted: string; expires_at: Date | null }>(
      "SELECT token_encrypted, expires_at FROM integrations WHERE provider = $1",
      [provider],
    );
    if (!row) return undefined;
    if (row.expires_at && row.expires_at.getTime() < Date.now()) return undefined;
    return decryptSecret(row.token_encrypted);
  } catch (err) {
    console.error(`[integrations] não foi possível ler o token de ${provider}`, err instanceof Error ? err.message : err);
    return undefined;
  }
}

/** Token da Meta: conexão feita na tela de Integrações; senão META_ACCESS_TOKEN do .env. */
export async function metaAccessToken(): Promise<string | undefined> {
  return (await storedToken("meta")) ?? env().META_ACCESS_TOKEN;
}

/** Refresh token do Google: conexão da tela de Integrações; senão GOOGLE_REFRESH_TOKEN do .env. */
export async function googleRefreshToken(): Promise<string | undefined> {
  return (await storedToken("google")) ?? env().GOOGLE_REFRESH_TOKEN;
}
