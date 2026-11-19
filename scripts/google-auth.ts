/**
 * Obtém o GOOGLE_REFRESH_TOKEN (Google Ads + GA4) e grava no .env.
 * Fluxo OAuth "loopback" com PKCE: https://developers.google.com/identity/protocols/oauth2/native-app
 *
 * Pré-requisito: GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no .env (cliente OAuth do tipo "App para computador").
 * Uso: npm run google:auth
 */
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import type { AddressInfo } from "node:net";
import { setEnvVar } from "./env-file";

const SCOPES = [
  "https://www.googleapis.com/auth/adwords",
  "https://www.googleapis.com/auth/analytics.readonly",
];

function openBrowser(url: string) {
  const cmd = process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", '""', `"${url}"`] : [url];
  spawn(cmd, args, { stdio: "ignore", detached: true, shell: process.platform === "win32" }).unref();
}

async function main() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("Preencha GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no .env antes (veja o README).");
  }

  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(16).toString("base64url");

  const code = await new Promise<{ code: string; redirectUri: string }>((resolvePromise, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }
      const err = url.searchParams.get("error");
      const got = url.searchParams.get("code");
      const ok = !err && got && url.searchParams.get("state") === state;
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        ok
          ? "<h2>Autorizado. Pode fechar esta aba e voltar ao terminal.</h2>"
          : `<h2>Falhou: ${err ?? "resposta inválida"}. Volte ao terminal.</h2>`,
      );
      server.close();
      if (ok) resolvePromise({ code: got!, redirectUri });
      else reject(new Error(`Autorização não concluída (${err ?? "state inválido"}).`));
    });
    let redirectUri = "";
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      redirectUri = `http://127.0.0.1:${port}/callback`;
      const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      auth.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: SCOPES.join(" "),
        access_type: "offline",
        prompt: "consent",
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
      }).toString();
      console.log("Abrindo o navegador para autorizar. Se não abrir, acesse:\n" + auth.toString() + "\n");
      openBrowser(auth.toString());
    });
    setTimeout(() => {
      server.close();
      reject(new Error("Tempo esgotado (5 min) aguardando a autorização."));
    }, 5 * 60_000).unref();
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code: code.code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: code.redirectUri,
    }),
  });
  const body = (await res.json()) as { refresh_token?: string; scope?: string; error_description?: string };
  if (!res.ok) throw new Error(`Troca do código falhou: ${body.error_description ?? res.status}`);
  if (!body.refresh_token) throw new Error("O Google não devolveu refresh_token. Rode de novo (o consentimento é forçado).");

  const granted = (body.scope ?? "").split(" ");
  const missing = SCOPES.filter((s) => !granted.includes(s));
  if (missing.length) console.warn("Atenção: escopos não concedidos:", missing.join(", "));

  setEnvVar("GOOGLE_REFRESH_TOKEN", body.refresh_token);
  console.log("GOOGLE_REFRESH_TOKEN gravado no .env. Rode: npm run check:credentials");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
