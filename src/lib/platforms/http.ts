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

/* ------------------------------------------------------------------
   Boas práticas de uso das APIs (evita bloqueios por excesso de chamadas):
   - no máximo MAX_CONCURRENT requisições simultâneas por plataforma;
   - 429/503/RESOURCE_EXHAUSTED: espera (Retry-After ou backoff exponencial) e tenta poucas vezes;
   - Meta sinalizou limite (códigos 4, 17, 32, 613, 80000–80014): PARA na hora, sem insistir,
     e bloqueia novas chamadas por alguns minutos, como a Meta recomenda.
   ------------------------------------------------------------------ */

const MAX_CONCURRENT = 4;
/** Sellbot: a tela Leads lê o detalhe de cada lead da página (uma chamada por lead), e a API aguenta mais paralelismo. */
const CONCURRENCY: Record<string, number> = { Sellbot: 10 };
const MAX_RETRIES = 2;
const META_COOLDOWN_MS = 5 * 60_000;

const queues = new Map<string, { active: number; waiting: (() => void)[] }>();
let metaBlockedUntil = 0;

async function acquire(platform: string): Promise<() => void> {
  let q = queues.get(platform);
  if (!q) queues.set(platform, (q = { active: 0, waiting: [] }));
  if (q.active >= (CONCURRENCY[platform] ?? MAX_CONCURRENT)) await new Promise<void>((r) => q!.waiting.push(r));
  q.active++;
  return () => {
    q!.active--;
    q!.waiting.shift()?.();
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const META_THROTTLE_CODES = new Set([4, 17, 32, 613]);
function isMetaThrottle(body: unknown): boolean {
  const err = (body as { error?: { code?: number } } | undefined)?.error;
  const code = err?.code;
  return typeof code === "number" && (META_THROTTLE_CODES.has(code) || (code >= 80000 && code <= 80014));
}

function isGoogleExhausted(status: number, body: unknown): boolean {
  if (status === 429) return true;
  const first = Array.isArray(body) ? body[0] : body;
  return (first as { error?: { status?: string } } | undefined)?.error?.status === "RESOURCE_EXHAUSTED";
}

/** fetch com fila, timeout, backoff e erro legível. Nunca inclui tokens na mensagem de erro. */
export async function fetchJson<T>(
  platform: string,
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const isMeta = platform.startsWith("Meta");
  if (isMeta && Date.now() < metaBlockedUntil) {
    const min = Math.ceil((metaBlockedUntil - Date.now()) / 60_000);
    throw new PlatformError(platform, `Limite de uso da Meta atingido. Aguarde ~${min} min antes de consultar de novo.`, 429);
  }

  const { timeoutMs = 30_000, ...rest } = init;
  const release = await acquire(platform);
  try {
    for (let attempt = 0; ; attempt++) {
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

      if (res.ok) return body as T;

      if (isMeta && isMetaThrottle(body)) {
        metaBlockedUntil = Date.now() + META_COOLDOWN_MS;
        throw new PlatformError(platform, "Limite de uso da Meta atingido. Novas consultas pausadas por 5 min.", 429);
      }

      const retryable = res.status === 503 || isGoogleExhausted(res.status, body) || (!isMeta && res.status === 429);
      if (retryable && attempt < MAX_RETRIES) {
        const retryAfter = Number(res.headers.get("retry-after"));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt + Math.random() * 500;
        await sleep(Math.min(wait, 15_000));
        continue;
      }

      throw new PlatformError(platform, extractMessage(body) ?? `HTTP ${res.status}`, res.status);
    }
  } finally {
    release();
  }
}

function extractMessage(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const b = body as Record<string, unknown>;
  const first = Array.isArray(body) ? (body[0] as Record<string, unknown>) : b;
  const err = first?.error as Record<string, unknown> | undefined;
  if (err && typeof err.message === "string") return err.message;
  if (typeof b.error_description === "string") return b.error_description;
  if (typeof b.message === "string") return b.message; // Sellbot
  return undefined;
}

export function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}
