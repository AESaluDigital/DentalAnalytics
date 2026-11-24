"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isMasterLogin, requireMaster } from "../auth";
import { query, queryOne } from "../db";
import { DEFAULT_PERMISSIONS, isPermission } from "../permissions";

const PAGE = "/settings/users";
const LOGIN_RE = /^[a-z0-9._@+-]{3,200}$/;

function back(kind: "ok" | "error", text: string): never {
  revalidatePath(PAGE);
  redirect(`${PAGE}?${kind}=${encodeURIComponent(text)}`);
}

function userId(form: FormData): number {
  const id = Number(form.get("id"));
  if (!Number.isInteger(id) || id <= 0) back("error", "Usuário inválido.");
  return id;
}

/** Usuários master não têm permissões editáveis nem podem ser desativados pela tela. */
async function loadEditable(id: number) {
  const row = await queryOne<{ email: string; name: string }>("SELECT email, name FROM users WHERE id = $1", [id]);
  if (!row) back("error", "Usuário não encontrado.");
  if (isMasterLogin(row.email)) back("error", "Contas master têm acesso total e não são alteradas por aqui.");
  return row;
}

export async function createUserAction(form: FormData): Promise<void> {
  await requireMaster();
  const name = String(form.get("name") ?? "").trim().slice(0, 120);
  const login = String(form.get("login") ?? "").trim().toLowerCase().slice(0, 200);
  const password = String(form.get("password") ?? "");
  if (name.length < 2) back("error", "Informe o nome.");
  if (!LOGIN_RE.test(login)) back("error", "Usuário/e-mail inválido: use letras, números e . _ - + @ (mín. 3).");
  if (password.length < 8 || password.length > 200) back("error", "A senha precisa ter ao menos 8 caracteres.");
  if (await queryOne("SELECT 1 FROM users WHERE email = $1", [login])) back("error", "Este usuário/e-mail já existe.");

  const hash = await bcrypt.hash(password, 12);
  await query(
    `INSERT INTO users (email, name, password_hash, role, permissions, active, pending)
     VALUES ($1, $2, $3, 'user', $4, TRUE, FALSE)`,
    [login, name, hash, DEFAULT_PERMISSIONS],
  );
  back("ok", `Usuário ${login} criado com as permissões padrão.`);
}

export async function savePermissionsAction(form: FormData): Promise<void> {
  await requireMaster();
  const id = userId(form);
  const row = await loadEditable(id);
  const perms = form.getAll("perm").map(String).filter(isPermission);
  await query("UPDATE users SET permissions = $1 WHERE id = $2", [[...new Set(perms)], id]);
  back("ok", `Permissões de ${row.name} salvas.`);
}

export async function approveUserAction(form: FormData): Promise<void> {
  await requireMaster();
  const id = userId(form);
  const row = await loadEditable(id);
  await query("UPDATE users SET active = TRUE, pending = FALSE WHERE id = $1", [id]);
  back("ok", `${row.name} aprovado(a).`);
}

export async function setActiveAction(form: FormData): Promise<void> {
  await requireMaster();
  const id = userId(form);
  const row = await loadEditable(id);
  const active = form.get("active") === "1";
  await query("UPDATE users SET active = $1, pending = FALSE WHERE id = $2", [active, id]);
  back("ok", `${row.name} ${active ? "reativado(a)" : "desativado(a)"}.`);
}

export async function rejectUserAction(form: FormData): Promise<void> {
  await requireMaster();
  const id = userId(form);
  const row = await loadEditable(id);
  await query("DELETE FROM users WHERE id = $1 AND pending", [id]);
  back("ok", `Cadastro de ${row.name} recusado.`);
}

export async function resetPasswordAction(form: FormData): Promise<void> {
  await requireMaster();
  const id = userId(form);
  const row = await loadEditable(id);
  const password = String(form.get("password") ?? "");
  if (password.length < 8 || password.length > 200) back("error", "A nova senha precisa ter ao menos 8 caracteres.");
  await query("UPDATE users SET password_hash = $1 WHERE id = $2", [await bcrypt.hash(password, 12), id]);
  back("ok", `Senha de ${row.name} redefinida.`);
}

export async function resetDefaultsAction(form: FormData): Promise<void> {
  await requireMaster();
  const id = userId(form);
  const row = await loadEditable(id);
  await query("UPDATE users SET permissions = $1 WHERE id = $2", [DEFAULT_PERMISSIONS, id]);
  back("ok", `${row.name} voltou às permissões padrão.`);
}
