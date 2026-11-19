"use server";

import { redirect } from "next/navigation";
import { createSession, destroySession, verifyCredentials } from "../auth";

export interface LoginState {
  error?: string;
}

export async function loginAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").slice(0, 200);
  const password = String(form.get("password") ?? "").slice(0, 200);
  if (!email || !password) return { error: "Informe e-mail e senha." };

  const user = await verifyCredentials(email, password);
  if (!user) return { error: "E-mail ou senha inválidos." };

  await createSession(user);
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
