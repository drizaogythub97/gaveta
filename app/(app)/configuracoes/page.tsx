import { Sliders, User } from "lucide-react";
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
] as const;

export default function ConfiguracoesPage() {
  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground mt-1 text-lg">
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
            <Card className="hover:bg-muted/50 h-full gap-3 p-6 transition-colors">
              <span className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-full">
                <Icon aria-hidden="true" className="size-6" />
              </span>
              <CardTitle className="text-xl">{titulo}</CardTitle>
              <CardDescription className="text-base">
                {descricao}
              </CardDescription>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
