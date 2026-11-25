import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import SiteFooter from "@/components/SiteFooter";
import "./globals.css";

// Fontes da identidade SuperDental, servidas pelo próprio app (next/font baixa no build).
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "SuperDental · Relatórios", template: "%s · SuperDental" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#060E11",
};

// Aplica o tema salvo (ou o do sistema) antes da pintura, para não piscar.
// Também aplica a cor principal escolhida (mesma conta de src/lib/accent.ts → accentVars).
const THEME_SCRIPT = `(function(){var r=document.documentElement;try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}r.dataset.theme=t}catch(e){r.dataset.theme="light"}
try{var v=localStorage.getItem("accentHue");if(v===null)return;var h=((Math.round(+v)%360)+360)%360;if(isNaN(h))return;
function rgb(h,s,l){s/=100;l/=100;var a=s*Math.min(l,1-l);function f(n){var k=(n+h/30)%12;return l-a*Math.max(-1,Math.min(k-3,Math.min(9-k,1)))}return[f(0),f(8),f(4)]}
function lum(c){return c.map(function(x){return x<=0.03928?x/12.92:Math.pow((x+0.055)/1.055,2.4)}).reduce(function(s,x,i){return s+x*[0.2126,0.7152,0.0722][i]},0)}
var base="hsl("+h+" 72% 42%)",hi="hsl("+h+" 70% 50%)";
var vars={"--brand-teal":base,"--brand-teal-hi":hi,"--brand-teal-lo":"hsl("+h+" 76% 30%)","--btn-bg":base,"--btn-bg-hover":hi,"--btn-ink":lum(rgb(h,72,42))>0.28?"#060E11":"#FFFFFF","--accent-l":"hsl("+h+" 76% 30%)","--accent-d":"hsl("+h+" 70% 58%)","--orb-1":"hsl("+h+" 70% 45% / 0.26)"};
for(var k in vars)r.style.setProperty(k,vars[k]);r.dataset.accent="1"}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: o script de tema e extensões (ex.: Google Tag Assistant) alteram atributos do <html>.
    <html lang="pt-BR" className={`${jakarta.variable} ${inter.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <div className="bg-orbs" aria-hidden>
          <span className="orb orb-1" />
          <span className="orb orb-2" />
          <span className="orb orb-3" />
        </div>
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
