import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { env } from "./env";
import { queryOne } from "./db";
import { ALL_PERMISSIONS, DEFAULT_PERMISSIONS, isPermission, type Permission } from "./permissions";

const COOKIE = "session";
const SESSION_HOURS = 10;

export interface SessionUser {
  id: number;
  email: string;
  name: string;
  role: "admin" | "user";
  /** Conta master (MASTER_ADMINS): acesso total e única que gerencia usuários/permissões. */
  master: boolean;
  permissions: Permission[];
}

interface UserRow {
  id: number;
  email: string;
  name: string;
  role: "admin" | "user";
  permissions: string[] | null;
}

function key() {
  return new TextEncoder().encode(env().SESSION_SECRET);
}

export function isMasterLogin(login: string): boolean {
  return env().MASTER_ADMINS.includes(login.toLowerCase());
}

/** Permissões efetivas: master → todas; definidas individualmente → elas; senão pelo papel. */
export function effectivePermissions(row: Pick<UserRow, "email" | "role" | "permissions">): Permission[] {
  if (isMasterLogin(row.email)) return [...ALL_PERMISSIONS];
  if (row.permissions) return row.permissions.filter(isPermission);
  return row.role === "admin" ? [...ALL_PERMISSIONS] : [...DEFAULT_PERMISSIONS];
}

function toSession(row: UserRow): SessionUser {
  const master = isMasterLogin(row.email);
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: master ? "admin" : row.role,
    master,
    permissions: effectivePermissions(row),
  };
}

// Hash usado quando o login não existe, para o tempo de resposta não revelar quais logins estão cadastrados.
let dummyHash: Promise<string> | undefined;
function getDummyHash(): Promise<string> {
  dummyHash ??= bcrypt.hash("senha-ficticia-nao-usada", 12);
  return dummyHash;
}

export type LoginResult = { ok: true; user: SessionUser } | { ok: false; pending?: boolean };

export async function verifyCredentials(login: string, password: string): Promise<LoginResult> {
  const row = await queryOne<UserRow & { password_hash: string; active: boolean; pending: boolean }>(
    "SELECT id, email, name, role, permissions, password_hash, active, pending FROM users WHERE email = $1",
    [login.trim().toLowerCase()],
  );
  const ok = await bcrypt.compare(password, row?.password_hash ?? (await getDummyHash()));
  if (!row || !ok) return { ok: false };
  if (!row.active) return { ok: false, pending: row.pending };
  return { ok: true, user: toSession(row) };
}

export async function createSession(user: SessionUser): Promise<void> {
  const token = await new SignJWT({ uid: user.id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(key());

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/** Usuário logado (revalida no banco: usuário desativado ou com permissão alterada vale na hora). */
export async function getUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    const uid = Number(payload.uid);
    if (!Number.isInteger(uid)) return null;
    const row = await queryOne<UserRow>(
      "SELECT id, email, name, role, permissions FROM users WHERE id = $1 AND active = TRUE",
      [uid],
    );
    return row ? toSession(row) : null;
  } catch {
    return null;
  }
}

export function can(user: SessionUser, permission: Permission): boolean {
  return user.master || user.permissions.includes(permission);
}

/** Primeira página que o usuário pode abrir. */
export function homeFor(user: SessionUser): string {
  if (can(user, "view_reports")) return "/dashboard";
  if (can(user, "view_clients")) return "/";
  return "/no-access";
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user, permission)) redirect(homeFor(user));
  return user;
}

/** Só as contas master (MASTER_ADMINS). */
export async function requireMaster(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.master) redirect(homeFor(user));
  return user;
}
