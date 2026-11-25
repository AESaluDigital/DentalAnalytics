import Link from "next/link";

/** Rodapé de todas as páginas, com o link da Política de Privacidade (LGPD). */
export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <span>© {new Date().getFullYear()} SuperDental · Salu Digital</span>
      <span aria-hidden>·</span>
      <Link href="/privacidade">Política de Privacidade</Link>
      <span aria-hidden>·</span>
      <span>Dados tratados conforme a LGPD (Lei nº 13.709/2018)</span>
    </footer>
  );
}
