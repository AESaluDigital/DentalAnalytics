import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser, homeFor } from "@/lib/auth";
import Logo from "@/components/Logo";
import AppearancePicker from "@/components/AppearancePicker";
import LoginForm from "./LoginForm";

export const metadata = { title: "Entrar" };

export default async function LoginPage() {
  const user = await getUser();
  if (user) redirect(homeFor(user));
  return (
    <div className="auth-wrap">
      <div className="auth-theme"><AppearancePicker /></div>
      <div className="auth-card stack">
        <Logo height={40} />
        <div>
          <h1>Relatórios de performance</h1>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            Meta Ads, Google Ads e GA4 dos clientes em um só lugar. Acesso restrito à equipe.
          </p>
        </div>
        <LoginForm />
        <p className="muted small auth-alt">
          Ainda não tem acesso? <Link href="/signup">Criar conta</Link>
        </p>
      </div>
    </div>
  );
}
