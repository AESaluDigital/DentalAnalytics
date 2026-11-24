"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { createSession, destroySession, homeFor, isMasterLogin, verifyCredentials } from "../auth";
import { ensureUserColumns, query, queryOne } from "../db";
import { DEFAULT_PERMISSIONS } from "../permissions";

export interface LoginState {
  error?: string;
}

export async function loginAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  const login = String(form.get("email") ?? "").slice(0, 200);
  const password = String(form.get("password") ?? "").slice(0, 200);
  if (!login || !password) return { error: "Informe usuário e senha." };

  const res = await verifyCredentials(login, password);
  if (!res.ok) {
    return {
      error: res.pending
        ? "Seu cadastro ainda aguarda aprovação de um administrador."
        : "Usuário ou senha inválidos.",
    };
  }

  await createSession(res.user);
  redirect(homeFor(res.user));
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}

export interface SignupState {
  error?: string;
  done?: boolean;
}

const LOGIN_RE = /^[a-z0-9._@+-]{3,200}$/;

/**
 * Cadastro pela tela de login. A conta nasce PENDENTE (sem acesso) com as permissões padrão;
 * só entra depois que uma conta master aprovar em Usuários.
 */
export async function signupAction(_prev: SignupState, form: FormData): Promise<SignupState> {
  const name = String(form.get("name") ?? "").trim().slice(0, 120);
  const login = String(form.get("login") ?? "").trim().toLowerCase().slice(0, 200);
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");

  if (name.length < 2) return { error: "Informe seu nome." };
  if (!LOGIN_RE.test(login)) return { error: "Usuário/e-mail inválido: use letras, números e . _ - + @ (mín. 3)." };
  if (password.length < 8) return { error: "A senha precisa ter ao menos 8 caracteres." };
  if (password.length > 200) return { error: "Senha longa demais." };
  if (password !== confirm) return { error: "As senhas não conferem." };

  // Logins master só são criados por quem já é master (tela Usuários), nunca pelo cadastro público.
  if (isMasterLogin(login)) return { error: "Este usuário/e-mail já está cadastrado." };
  await ensureUserColumns();
  const exists = await queryOne("SELECT 1 FROM users WHERE email = $1", [login]);
  if (exists) return { error: "Este usuário/e-mail já está cadastrado." };

  // Limite simples contra abuso: no máximo 20 cadastros pendentes ao mesmo tempo.
  const pending = await queryOne<{ n: number }>("SELECT count(*)::int AS n FROM users WHERE pending");
  if ((pending?.n ?? 0) >= 20) return { error: "Muitos cadastros aguardando aprovação. Fale com o TI." };

  const hash = await bcrypt.hash(password, 12);
  await query(
    `INSERT INTO users (email, name, password_hash, role, permissions, active, pending)
     VALUES ($1, $2, $3, 'user', $4, FALSE, TRUE)
     ON CONFLICT (email) DO NOTHING`,
    [login, name, hash, DEFAULT_PERMISSIONS],
  );
  return { done: true };
}
