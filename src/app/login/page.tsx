import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import Logo from "@/components/Logo";
import LoginForm from "./LoginForm";

export const metadata = { title: "Entrar" };

export default async function LoginPage() {
  if (await getUser()) redirect("/dashboard");
  return (
    <div className="login-wrap">
      <div className="login-card stack">
        <Logo variant="onDark" height={40} />
        <div>
          <h1>Relatórios de performance</h1>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            Meta Ads, Google Ads e GA4 dos clientes em um só lugar. Acesso restrito à equipe.
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
