"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/lib/actions/auth";

export default function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  return (
    <form action={action} className="stack">
      <label>
        Usuário ou e-mail
        <input type="text" name="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required />
      </label>
      <label>
        Senha
        <input type="password" name="password" autoComplete="current-password" required />
      </label>
      {state.error && <p className="error" role="alert">{state.error}</p>}
      <button className="btn primary" type="submit" disabled={pending}>
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
