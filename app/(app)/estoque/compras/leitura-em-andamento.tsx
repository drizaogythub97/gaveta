"use client";

import { FileText, Image as ImageIcon, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import loaderStyles from "@/components/app/gaveta-loader.module.css";

/** Por onde a nota está sendo lida — muda o que dá para prometer de tempo. */
export type ViaDeLeitura = "xml" | "pdf" | "foto" | "ia";

type Perfil = {
  rotulo: string;
  /** Quanto costuma levar, em segundos, medido nas notas reais. */
  esperado: [number, number];
  expectativa: string;
  etapas: string[];
  Icone: typeof FileText;
};

const PERFIS: Record<ViaDeLeitura, Perfil> = {
  xml: {
    rotulo: "arquivo XML",
    esperado: [0, 5],
    expectativa: "O XML é exato e costuma ser quase instantâneo.",
    etapas: [
      "abrindo o arquivo",
      "lendo os itens da nota",
      "conferindo com o seu cadastro",
    ],
    Icone: FileText,
  },
  pdf: {
    rotulo: "PDF",
    esperado: [2, 12],
    expectativa: "PDFs costumam levar poucos segundos.",
    etapas: [
      "abrindo o arquivo",
      "procurando o texto da nota",
      "identificando os itens",
      "conferindo com o seu cadastro",
    ],
    Icone: FileText,
  },
  foto: {
    rotulo: "foto da nota",
    esperado: [15, 45],
    expectativa: "Fotos costumam levar de 20 a 40 segundos.",
    etapas: [
      "abrindo a imagem",
      "reconhecendo as letras (isso é a parte demorada)",
      "separando os nomes dos produtos",
      "conferindo com o seu cadastro",
    ],
    Icone: ImageIcon,
  },
  ia: {
    rotulo: "leitura por IA",
    esperado: [5, 30],
    expectativa: "A IA costuma responder em 5 a 30 segundos.",
    etapas: [
      "enviando o arquivo",
      "a IA está lendo a nota",
      "conferindo os itens com o seu cadastro",
    ],
    Icone: Sparkles,
  },
};

/**
 * Painel de espera da leitura de nota — o nível 4 do feedback de
 * carregamento.
 *
 * Por que não basta o giro de antes: ler uma foto ou mandar para a IA leva de
 * 5 a 70 segundos (medido). Uma bolinha girando por quarenta segundos não
 * parece "trabalhando", parece travado — e a pessoa sai da tela levando junto
 * a leitura que estava quase pronta.
 *
 * O que este painel mostra é só o que se sabe de verdade:
 *
 * - **o tempo corrido**, que é real e é o que mais desmente o "travou";
 * - **o que costuma demorar** naquela via, medido em notas de verdade;
 * - **o que o sistema faz**, para a espera ter sentido.
 *
 * O que ele NÃO faz é marcar etapa como concluída. A leitura é uma ida só ao
 * servidor: o navegador não tem como saber em qual passo ela está, e riscar
 * etapas no relógio seria inventar progresso. Passado o tempo esperado, o
 * painel avisa que está demorando mais — em vez de fingir que está tudo no
 * ritmo.
 */
export function LeituraEmAndamento({
  via,
  nomeArquivo,
}: {
  via: ViaDeLeitura;
  nomeArquivo?: string;
}) {
  const perfil = PERFIS[via];
  const [segundos, setSegundos] = useState(0);

  useEffect(() => {
    const relogio = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(relogio);
  }, []);

  const demorando = segundos > perfil.esperado[1];
  const { Icone } = perfil;

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-primary/30 bg-primary/5 flex flex-col gap-3 rounded-xl border p-4"
    >
      <div className="flex items-center gap-3">
        <span className="bg-primary/15 text-primary flex size-11 shrink-0 items-center justify-center rounded-full">
          <Icone aria-hidden="true" className="size-5" />
        </span>
        <div className="flex min-w-0 flex-col">
          <span
            aria-hidden="true"
            className={`text-base font-semibold ${loaderStyles.dots}`}
          >
            Lendo a nota<span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
          <span className="text-muted-foreground truncate text-sm">
            {nomeArquivo ? `${nomeArquivo} · ` : ""}
            {perfil.rotulo}
          </span>
        </div>
        <span
          aria-hidden="true"
          className="text-muted-foreground ml-auto text-lg font-semibold tabular-nums"
        >
          {segundos}s
        </span>
      </div>

      <p className="text-muted-foreground text-sm">
        O Gaveta está {perfil.etapas.join(", ")}.
      </p>

      <p className="text-sm">
        {demorando ? (
          <span className="text-foreground font-medium">
            Está demorando mais que o normal, mas ainda está lendo. Pode
            esperar — se der erro, o Gaveta avisa.
          </span>
        ) : (
          <span className="text-muted-foreground">
            {perfil.expectativa} Pode deixar a tela aberta.
          </span>
        )}
      </p>

      {/* O tempo também precisa chegar a quem não enxerga, mas sem falar a
          cada segundo: só nos marcos, para não virar tagarelice. */}
      <span className="sr-only">
        {demorando
          ? "A leitura está demorando mais que o normal, mas continua em andamento."
          : `Lendo a nota. ${perfil.expectativa}`}
      </span>
    </div>
  );
}
