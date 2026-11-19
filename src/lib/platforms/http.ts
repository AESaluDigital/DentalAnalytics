import "server-only";

export class PlatformError extends Error {
  constructor(
    public platform: string,
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "PlatformError";
  }
}

/** fetch com timeout e erro legível. Nunca inclui tokens na mensagem de erro. */
export async function fetchJson<T>(
  platform: string,
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs = 30_000, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, { ...rest, signal: controller.signal, cache: "no-store" });
  } catch (err) {
    const reason = err instanceof Error && err.name === "AbortError" ? "tempo esgotado" : "falha de rede";
    throw new PlatformError(platform, `Não foi possível contatar a API (${reason}).`);
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let body: unknown = undefined;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    // resposta não-JSON
  }

  if (!res.ok) {
    throw new PlatformError(platform, extractMessage(body) ?? `HTTP ${res.status}`, res.status);
  }
  return body as T;
}

function extractMessage(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const b = body as Record<string, unknown>;
  // Meta: { error: { message } } | Google: { error: { message } } ou [ { error: {...} } ]
  const first = Array.isArray(body) ? (body[0] as Record<string, unknown>) : b;
  const err = first?.error as Record<string, unknown> | undefined;
  if (err && typeof err.message === "string") return err.message;
  if (typeof b.error_description === "string") return b.error_description;
  return undefined;
}

export function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}
