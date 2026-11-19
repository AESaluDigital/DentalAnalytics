import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { finishGoogle, finishMeta } from "@/lib/oauth";
import { saveIntegration, type Provider } from "@/lib/integrations";
import { PlatformError } from "@/lib/platforms/http";
import { clearDiscoveryCache } from "@/lib/platforms/discovery";
import { clearGoogleTokenCache } from "@/lib/platforms/google-oauth";

export const dynamic = "force-dynamic";

function sameString(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Retorno do login da Meta/Google: valida o state, troca o código e guarda o token criptografado. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const back = new URL("/settings/integrations", req.url);
  const fail = (msg: string) => {
    back.searchParams.set("error", msg);
    const res = NextResponse.redirect(back);
    res.cookies.delete({ name: `oauth_${provider}`, path: `/api/integrations/${provider}` });
    return res;
  };

  if (provider !== "meta" && provider !== "google") return fail("Integração desconhecida.");

  const user = await getUser();
  if (!user || user.role !== "admin") return fail("Apenas administradores podem conectar integrações.");

  const params = req.nextUrl.searchParams;
  if (params.get("error")) {
    return fail(params.get("error_description") ?? "Conexão cancelada na plataforma.");
  }

  let saved: { state: string; verifier: string; uid: number } | null = null;
  try {
    saved = JSON.parse(req.cookies.get(`oauth_${provider}`)?.value ?? "null");
  } catch {
    saved = null;
  }
  const state = params.get("state") ?? "";
  const code = params.get("code") ?? "";
  if (!saved || !state || !code || !sameString(saved.state, state) || saved.uid !== user.id) {
    return fail("Sessão de conexão inválida ou expirada. Tente de novo.");
  }

  try {
    const result = provider === "meta" ? await finishMeta(code) : await finishGoogle(code, saved.verifier);
    await saveIntegration({ provider: provider as Provider, ...result, userId: user.id });
  } catch (err) {
    if (!(err instanceof PlatformError)) console.error("[integrations] erro ao concluir conexão", err);
    return fail(err instanceof PlatformError ? err.message : "Não foi possível concluir a conexão.");
  }

  clearDiscoveryCache();
  if (provider === "google") clearGoogleTokenCache();

  back.searchParams.set("ok", provider);
  const res = NextResponse.redirect(back);
  res.cookies.delete({ name: `oauth_${provider}`, path: `/api/integrations/${provider}` });
  return res;
}
