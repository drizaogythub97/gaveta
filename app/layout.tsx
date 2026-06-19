import type { Metadata } from "next";
import { Inter, Geist } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { getThemeFromCookie } from "@/lib/theme/cookie";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ERP Simples",
  description:
    "Sistema de gestão simples para produtos, vendas e faturamento — acessível e fácil de usar.",
};

// Script injetado no <head> para aplicar o tema antes da hidratação,
// evitando o piscar branco→escuro (FOUC) em quem usa o modo escuro.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var m = document.cookie.match(/(?:^|; )erp_theme=([^;]+)/);
    var v = m ? decodeURIComponent(m[1]) : null;
    if (v === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.style.colorScheme = 'dark';
    } else {
      document.documentElement.style.colorScheme = 'light';
    }
  } catch (e) {}
})();
`;

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const theme = await getThemeFromCookie();
  const isDark = theme === "dark";

  return (
    <html
      lang="pt-BR"
      className={cn(
        "antialiased",
        inter.variable,
        "font-sans",
        geist.variable,
        isDark ? "dark" : undefined,
      )}
      style={{ colorScheme: isDark ? "dark" : "light" }}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
      </head>
      <body className="bg-background text-foreground min-h-screen">
        {children}
      </body>
    </html>
  );
}
