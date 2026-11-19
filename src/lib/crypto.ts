import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "./env";

/** AES-256-GCM. Formato: v1.<iv>.<tag>.<cifrado> (base64url). */

function key(): Buffer {
  const raw = env().INTEGRATIONS_KEY;
  if (!raw) throw new Error("INTEGRATIONS_KEY não configurada no .env.");
  const k = Buffer.from(raw, "base64url");
  if (k.length !== 32) throw new Error("INTEGRATIONS_KEY deve ter 32 bytes (base64url).");
  return k;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function decryptSecret(blob: string): string {
  const [v, iv, tag, data] = blob.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Segredo criptografado em formato inválido.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
