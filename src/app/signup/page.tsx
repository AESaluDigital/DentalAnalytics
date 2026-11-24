import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser, homeFor } from "@/lib/auth";
import Logo from "@/components/Logo";
import AppearancePicker from "@/components/AppearancePicker";
import SignupForm from "./SignupForm";

export const metadata = { title: "Criar conta" };

export default async function SignupPage() {
  const user = await getUser();
  if (user) redirect(homeFor(user));
  return (
    <div className="auth-wrap">
      <div className="auth-theme"><AppearancePicker /></div>
      <div className="auth-card stack">
        <Logo height={40} />
        <div>
          <h1>Criar conta</h1>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            Seu acesso é liberado depois que um administrador aprovar o cadastro.
          </p>
        </div>
        <SignupForm />
        <p className="muted small auth-alt">
          Já tem conta? <Link href="/login">Entrar</Link>
        </p>
      </div>
    </div>
  );
}
