import Link from "next/link";

export default function NotFound() {
  return (
    <div className="login-wrap">
      <div className="card stack">
        <h1>Página não encontrada</h1>
        <p className="muted">O endereço não existe ou o link de relatório expirou ou foi revogado.</p>
        <Link href="/">Voltar ao início</Link>
      </div>
    </div>
  );
}
