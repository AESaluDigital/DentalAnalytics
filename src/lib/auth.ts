import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { env } from "./env";
import { queryOne } from "./db";

const COOKIE = "session";
const SESSION_HOURS = 10;

export interface SessionUser {
  id: number;
  email: string;
  name: string;
  role: "admin" | "user";
}

function key() {
  return new TextEncoder().encode(env().SESSION_SECRET);
}

// Hash usado quando o e-mail não existe, para o tempo de resposta não revelar quais e-mails estão cadastrados.
let dummyHash: Promise<string> | undefined;
function getDummyHash(): Promise<string> {
  dummyHash ??= bcrypt.hash("senha-ficticia-nao-usada", 12);
  return dummyHash;
}

export async function verifyCredentials(email: string, password: string): Promise<SessionUser | null> {
  const row = await queryOne<SessionUser & { password_hash: string; active: boolean }>(
    "SELECT id, email, name, role, password_hash, active FROM users WHERE email = $1",
    [email.trim().toLowerCase()],
  );
  const ok = await bcrypt.compare(password, row?.password_hash ?? (await getDummyHash()));
  if (!row || !ok || !row.active) return null;
  return { id: row.id, email: row.email, name: row.name, role: row.role };
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

/** Usuário logado (revalida no banco: usuário desativado perde acesso na hora). */
export async function getUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    const uid = Number(payload.uid);
    if (!Number.isInteger(uid)) return null;
    return await queryOne<SessionUser>(
      "SELECT id, email, name, role FROM users WHERE id = $1 AND active = TRUE",
      [uid],
    );
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  return user;
}
