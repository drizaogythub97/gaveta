import { ArrowUpRight, KeyRound, NotebookPen, ShoppingCart } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FIADOAPP_URL } from "@/lib/ecossistema";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

import { resumoFiadoPdv } from "@/lib/ecossistema-server";

import { salvarMarcaUnica, salvarSwitcher } from "./actions";
import { EcoToggle } from "./eco-toggle";
import { FiadoPdvToggle } from "./fiado-pdv-toggle";

export const metadata = { title: "Ecossistema" };

export default async function EcossistemaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: prefs } = await supabase
    .from("ecossistema_prefs")
    .select("switcher_ativo, marca_unica, fiado_pdv_ativo")
    .eq("user_id", user?.id ?? "")
    .maybeSingle();
  const switcherAtivo = Boolean(prefs?.switcher_ativo);
  const marcaUnica = Boolean(prefs?.marca_unica);
  const fiadoPdv = Boolean(prefs?.fiado_pdv_ativo);
  const resumoPdv = await resumoFiadoPdv(supabase, user?.id ?? "");

  return (
    <section className="minimal:max-sm:gap-4 flex max-w-2xl flex-col gap-6">
      <header>
        <h1 className="minimal:max-sm:text-xl text-3xl font-semibold tracking-tight">
          Ecossistema
        </h1>
        <p className="minimal:max-sm:text-sm text-muted-foreground mt-1 text-lg">
          O Gaveta faz parte de uma família de apps para o seu comércio.
          Usar os outros é opcional — este app sempre funciona completo
          sozinho.
        </p>
      </header>

      {/* ── FIADOAPP ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="minimal:max-sm:border-b minimal:max-sm:border-border/60 minimal:max-sm:pb-3">
          <CardTitle className="minimal:max-sm:text-base flex items-center gap-2 text-xl">
            <NotebookPen aria-hidden="true" className="text-primary size-5" />
            FiadoApp — vendas a prazo
          </CardTitle>
          <CardDescription className="minimal:max-sm:text-sm text-base">
            O caderno de fiado digital: clientes, vendas a prazo, controle de
            quem deve, cobrança pelo WhatsApp e comprovantes.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="minimal:max-sm:text-sm text-muted-foreground flex items-start gap-2 text-base">
            <KeyRound
              aria-hidden="true"
              className="text-primary mt-0.5 size-4 shrink-0"
            />
            Sua conta já funciona lá: entre com o mesmo e-mail e a mesma
            senha do Gaveta.
          </p>
          <a
            href={FIADOAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              buttonVariants(),
              "minimal:max-sm:h-11 minimal:max-sm:text-sm h-12 self-start px-6 text-base font-medium",
            )}
          >
            Abrir o FiadoApp
            <ArrowUpRight aria-hidden="true" className="size-5" />
          </a>
        </CardContent>
      </Card>

      {/* ── ATALHO (1º toggle real do ecossistema — opt-in) ────────── */}
      <Card>
        <CardHeader className="minimal:max-sm:border-b minimal:max-sm:border-border/60 minimal:max-sm:pb-3">
          <CardTitle className="minimal:max-sm:text-base text-xl">
            Atalho rápido no menu
          </CardTitle>
          <CardDescription className="minimal:max-sm:text-sm text-base">
            Mostra um botão para abrir o FiadoApp no topo do app (computador)
            e no menu &quot;Mais&quot; (celular). Vale para a sua conta —
            aparece nos dois apps. Desativado por padrão.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EcoToggle
            ativoInicial={switcherAtivo}
            rotulo="Atalho rápido no menu"
            onSalvar={salvarSwitcher}
            msgAtivado="Atalho ativado."
            msgDesativado="Atalho desativado."
          />
        </CardContent>
      </Card>

      {/* ── MARCA ÚNICA (estágio 2 — opt-in) ───────────────────────── */}
      <Card>
        <CardHeader className="minimal:max-sm:border-b minimal:max-sm:border-border/60 minimal:max-sm:pb-3">
          <CardTitle className="minimal:max-sm:text-base text-xl">
            Marca única da loja
          </CardTitle>
          <CardDescription className="minimal:max-sm:text-sm text-base">
            O nome e a logo da sua loja passam a valer nos dois apps,
            editáveis de qualquer um. Ao ativar aqui, a marca configurada no
            Gaveta é copiada para o FiadoApp. Ao desativar, cada app volta à
            marca que tinha antes de ativar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EcoToggle
            ativoInicial={marcaUnica}
            rotulo="Marca única da loja"
            onSalvar={salvarMarcaUnica}
            msgAtivado="Marca única ativada — a marca do Gaveta agora vale nos dois apps."
            msgDesativado="Marca única desativada — cada app voltou à marca anterior."
          />
        </CardContent>
      </Card>

      {/* ── VENDA A PRAZO NO CAIXA (Fase 1 — opt-in) ───────────────── */}
      <Card>
        <CardHeader className="minimal:max-sm:border-b minimal:max-sm:border-border/60 minimal:max-sm:pb-3">
          <CardTitle className="minimal:max-sm:text-base flex items-center gap-2 text-xl">
            <ShoppingCart aria-hidden="true" className="text-primary size-5" />
            Venda a prazo no caixa
          </CardTitle>
          <CardDescription className="minimal:max-sm:text-sm text-base">
            Libera a forma de pagamento &quot;Venda a Prazo (Fiado)&quot; aqui
            no caixa. Você escolhe o cliente (ou cadastra na hora) e a venda já
            entra como fiado a receber no FiadoApp — sem digitar de novo. O
            que os clientes devem aparece no seu financeiro como valor a
            receber, e só entra no faturamento quando for pago no FiadoApp.
            Desativado por padrão.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FiadoPdvToggle ativoInicial={fiadoPdv} resumo={resumoPdv} />
        </CardContent>
      </Card>
    </section>
  );
}
