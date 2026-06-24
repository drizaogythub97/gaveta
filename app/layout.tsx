import type { Metadata, Viewport } from "next";
import { Inter, Geist } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { cn } from "@/lib/utils";
import { getThemeFromCookie } from "@/lib/theme/cookie";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const SITE_URL = "https://gaveta-erp.vercel.app";
const SITE_DESCRIPTION =
  "Frente de caixa e gestão simples para produtos, vendas e faturamento — acessível e fácil de usar.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Gaveta",
    template: "%s · Gaveta",
  },
  description: SITE_DESCRIPTION,
  applicationName: "Gaveta",
  openGraph: {
    type: "website",
    siteName: "Gaveta",
    title: "Gaveta",
    description: SITE_DESCRIPTION,
    locale: "pt_BR",
    url: SITE_URL,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Gaveta — frente de caixa e gestão simples",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Gaveta",
    description: SITE_DESCRIPTION,
    images: ["/og-image.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#1b7a43",
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
  const nonce = (await headers()).get("x-nonce") ?? undefined;

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
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
      </head>
      <body className="bg-background text-foreground min-h-screen">
        {children}
      </body>
    </html>
  );
}
