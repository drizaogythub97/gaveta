import type { Metadata } from "next";
import { Inter, Geist } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="pt-BR"
      className={cn("antialiased", inter.variable, "font-sans", geist.variable)}
    >
      <body className="bg-background text-foreground min-h-screen">
        {children}
      </body>
    </html>
  );
}
