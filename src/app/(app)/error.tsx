"use client";

import { useEffect } from "react";

/** Erro inesperado numa página logada: mensagem amigável no lugar da tela em branco. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="card stack" style={{ maxWidth: 620, margin: "40px auto", textAlign: "center" }}>
      <h1>Algo deu errado ao carregar esta página</h1>
      <p className="muted" style={{ margin: 0 }}>
        Tente de novo em alguns segundos. Se continuar, envie este código ao suporte:{" "}
        <code>{error.digest ?? "sem código"}</code>
      </p>
      <div className="row" style={{ justifyContent: "center" }}>
        <button className="btn primary" type="button" onClick={() => reset()}>Tentar de novo</button>
        <a className="btn" href="/dashboard">Ir para o dashboard</a>
      </div>
    </div>
  );
}
