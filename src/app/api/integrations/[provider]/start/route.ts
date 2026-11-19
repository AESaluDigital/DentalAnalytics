import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { isConfigured, startUrl } from "@/lib/oauth";
import type { Provider } from "@/lib/integrations";

export const dynamic = "force-dynamic";

/** Inicia o login oficial na Meta/Google. Só admins. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const back = new URL("/settings/integrations", req.url);

  const user = await getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  if (user.role !== "admin") return NextResponse.redirect(new URL("/", req.url));
  if (provider !== "meta" && provider !== "google") return NextResponse.redirect(back);

  const cfg = isConfigured(provider as Provider);
  if (!cfg.ok) {
    back.searchParams.set("error", `Configuração faltando no .env: ${cfg.missing.join(", ")}`);
    return NextResponse.redirect(back);
  }

  const { url, state, verifier } = startUrl(provider as Provider);
  const res = NextResponse.redirect(url);
  res.cookies.set(`oauth_${provider}`, JSON.stringify({ state, verifier, uid: user.id }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/api/integrations/${provider}`,
    maxAge: 600,
  });
  return res;
}
