"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signupAction, type SignupState } from "@/lib/actions/auth";

export default function SignupForm() {
  const [state, action, pending] = useActionState<SignupState, FormData>(signupAction, {});

  if (state.done) {
    return (
      <div className="stack">
        <p className="notice ok" role="status">
          Cadastro enviado! Assim que um administrador aprovar, você já pode entrar.
        </p>
        <Link className="btn primary" href="/login">Voltar ao login</Link>
      </div>
    );
  }

  return (
    <form action={action} className="stack">
      <label>
        Nome
        <input type="text" name="name" autoComplete="name" required maxLength={120} />
      </label>
      <label>
        Usuário ou e-mail
        <input type="text" name="login" autoComplete="username" autoCapitalize="none" spellCheck={false} required
          maxLength={200} />
      </label>
      <label>
        Senha <span className="hint">mín. 8 caracteres</span>
        <input type="password" name="password" autoComplete="new-password" minLength={8} required />
      </label>
      <label>
        Confirmar senha
        <input type="password" name="confirm" autoComplete="new-password" minLength={8} required />
      </label>
      {state.error && <p className="error" role="alert">{state.error}</p>}
      <button className="btn primary" type="submit" disabled={pending}>
        {pending ? "Enviando…" : "Criar conta"}
      </button>
    </form>
  );
}
