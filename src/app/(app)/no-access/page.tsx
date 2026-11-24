import { requireUser } from "@/lib/auth";

export const metadata = { title: "Sem acesso" };

export default async function NoAccessPage() {
  const user = await requireUser();
  return (
    <div className="card stack" style={{ maxWidth: 560, margin: "40px auto", textAlign: "center" }}>
      <h1>Sem permissões ainda</h1>
      <p className="muted" style={{ margin: 0 }}>
        Olá, {user.name}. Sua conta está ativa, mas ainda não tem acesso a nenhuma área. Peça a um administrador
        para liberar suas permissões.
      </p>
    </div>
  );
}
