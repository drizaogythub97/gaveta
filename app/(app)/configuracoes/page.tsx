import { Blocks, Sliders, User } from "lucide-react";
import Link from "next/link";

import { Card, CardDescription, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Configurações" };

const OPCOES = [
  {
    href: "/preferencias",
    titulo: "Preferências",
    descricao: "Tema, marca e taxas.",
    Icon: Sliders,
  },
  {
    href: "/minha-conta",
    titulo: "Minha conta",
    descricao: "Seus dados pessoais, e-mail, senha e exclusão da conta.",
    Icon: User,
  },
  // Descoberta do ecossistema: card PERMANENTE — integração é opt-in.
  {
    href: "/ecossistema",
    titulo: "Ecossistema",
    descricao:
      "Conheça o FiadoApp, o app de vendas a prazo que usa a mesma conta.",
    Icon: Blocks,
  },
] as const;

export default function ConfiguracoesPage() {
  return (
    <section className="minimal:max-sm:gap-4 flex flex-col gap-6">
      <header>
        <h1 className="minimal:max-sm:text-xl text-3xl font-bold tracking-tight">Configurações</h1>
        <p className="minimal:max-sm:text-sm text-muted-foreground mt-1 text-lg">
          Escolha o que você quer ajustar.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {OPCOES.map(({ href, titulo, descricao, Icon }) => (
          <Link
            key={href}
            href={href}
            className="focus-visible:ring-ring/50 rounded-xl outline-none focus-visible:ring-3"
          >
            <Card className="minimal:max-sm:p-4 minimal:max-sm:gap-2 hover:bg-muted/50 h-full gap-3 p-6 transition-colors">
              <span className="minimal:max-sm:size-10 bg-primary/10 text-primary flex size-12 items-center justify-center rounded-full">
                <Icon aria-hidden="true" className="size-6" />
              </span>
              <CardTitle className="minimal:max-sm:text-base text-xl">{titulo}</CardTitle>
              <CardDescription className="minimal:max-sm:text-sm text-base">
                {descricao}
              </CardDescription>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
