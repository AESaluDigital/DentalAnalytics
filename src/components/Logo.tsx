/* eslint-disable @next/next/no-img-element */

/** Logo SuperDental. variant "auto" troca a versão conforme o tema claro/escuro. */
export default function Logo({
  variant = "auto",
  height = 30,
}: {
  variant?: "auto" | "onDark" | "onLight";
  height?: number;
}) {
  const style = { height, width: "auto" };
  const onDark = <img src="/brand/superdental-logo-branco.png" alt="SuperDental" style={style} />;
  const onLight = <img src="/brand/superdental-logo.webp" alt="SuperDental" style={style} />;
  if (variant === "onDark") return onDark;
  if (variant === "onLight") return onLight;
  return (
    <>
      <span className="logo-light">{onLight}</span>
      <span className="logo-dark">{onDark}</span>
    </>
  );
}
