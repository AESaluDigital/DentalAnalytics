/* eslint-disable @next/next/no-img-element */

const FILES = {
  horizontal: { onLight: "/brand/superdental-logo.png", onDark: "/brand/superdental-logo-branco.png" },
  vertical: { onLight: "/brand/superdental-logo-vertical.png", onDark: "/brand/superdental-logo-vertical-branco.png" },
} as const;

/**
 * Logo SuperDental. variant "auto" troca a versão conforme o tema claro/escuro.
 * layout "horizontal" (símbolo ao lado do nome) para barras e cabeçalhos; "vertical" (símbolo acima) para telas de entrada.
 */
export default function Logo({
  variant = "auto",
  layout = "horizontal",
  height = 30,
}: {
  variant?: "auto" | "onDark" | "onLight";
  layout?: "horizontal" | "vertical";
  height?: number;
}) {
  const style = { height, width: "auto" };
  const files = FILES[layout];
  const onDark = <img src={files.onDark} alt="SuperDental" style={style} />;
  const onLight = <img src={files.onLight} alt="SuperDental" style={style} />;
  if (variant === "onDark") return onDark;
  if (variant === "onLight") return onLight;
  return (
    <>
      <span className="logo-light">{onLight}</span>
      <span className="logo-dark">{onDark}</span>
    </>
  );
}
