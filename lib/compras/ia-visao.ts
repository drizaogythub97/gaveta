import "server-only";

import { z } from "zod";

import { MAXIMO_ITENS_EXTRAIDOS, type NotaExtraida } from "./tipos";

/**
 * Leitura de nota por IA de visão (plano 08, fase G2d).
 *
 * É a via mais forte para nota de PAPEL — e a única que sai da nossa
 * infraestrutura. Por isso:
 *   • é acionada só quando a pessoa pede, nunca automaticamente;
 *   • fica liberada apenas para as contas listadas em `IA_VISAO_LIBERADA_PARA`
 *     (fase de teste), e a checagem é feita na server action, não na tela;
 *   • a saída passa por Zod e cai na MESMA tela de conferência das outras
 *     vias. Esquema estruturado garante o FORMATO, não o VALOR: o modelo
 *     erra "bonito", devolvendo número plausível e errado. A conferência
 *     humana continua sendo a única defesa.
 *
 * Modelo escolhido por medição na nota de papel real do dono (2026-08-29),
 * com resultado IDÊNTICO nos três e latências bem diferentes:
 *   gemini-3.5-flash-lite → 4,9s   ← escolhido
 *   gemini-2.5-flash      → 17,4s
 *   gemini-3.7-flash      → 67,7s
 */

const MODELO = "gemini-3.5-flash-lite";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/** A leitura é lenta o bastante para precisar de teto próprio. */
const TEMPO_LIMITE_MS = 90_000;

export class IaIndisponivel extends Error {}
export class IaSemProdutos extends Error {}

/** Contas liberadas para a IA nesta fase de teste (ids separados por vírgula). */
export function contasLiberadasParaIa(): string[] {
  return (process.env.IA_VISAO_LIBERADA_PARA ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

/**
 * A liberação vive em variável de ambiente, e NÃO numa coluna do banco: as
 * tabelas são expostas pela API, então uma flag de privilégio gravável pelo
 * próprio usuário poderia ser auto-concedida. Sem chave configurada, a via
 * simplesmente não existe.
 */
export function iaLiberadaPara(userId: string): boolean {
  if (!process.env.GEMINI_API_KEY) return false;
  return contasLiberadasParaIa().includes(userId);
}

const PROMPT = `Você recebe a imagem de uma nota fiscal, cupom ou pedido de compra brasileiro.

Extraia APENAS o que está escrito no documento. Regras obrigatórias:
- NÃO invente, NÃO corrija e NÃO complete nada. Copie como está.
- Se um valor não estiver legível ou não existir, devolva null nesse campo.
- Números brasileiros usam vírgula decimal ("1.234,56" = 1234.56).
- "quantidade" é quantas unidades foram compradas.
- "custoUnitario" é o valor pago POR UNIDADE (não o total da linha).
- "descricao" é o nome do produto como impresso.
- "chaveAcesso" só existe em nota fiscal eletrônica: 44 dígitos.
- "emitidaEm" no formato AAAA-MM-DD.

Devolva todos os itens da tabela de produtos, na ordem em que aparecem.`;

/** Esquema enviado à API para forçar o formato da resposta. */
const ESQUEMA_DA_RESPOSTA = {
  type: "object",
  properties: {
    fornecedor: { type: "string", nullable: true },
    chaveAcesso: { type: "string", nullable: true },
    emitidaEm: { type: "string", nullable: true },
    total: { type: "number", nullable: true },
    itens: {
      type: "array",
      items: {
        type: "object",
        properties: {
          descricao: { type: "string" },
          barcode: { type: "string", nullable: true },
          quantidade: { type: "number", nullable: true },
          custoUnitario: { type: "number", nullable: true },
          totalLinha: { type: "number", nullable: true },
        },
        required: ["descricao"],
      },
    },
  },
  required: ["itens"],
} as const;

/**
 * O MESMO esquema, revalidado aqui. Não é redundância: o que volta da rede é
 * entrada não confiável como qualquer outra, e o `responseSchema` da API não
 * é garantia contratual. Valores fora de faixa são recusados em vez de
 * entrarem no estoque.
 */
const numeroPositivo = z
  .number()
  .finite()
  .positive()
  .max(9_999_999)
  .nullable()
  .catch(null);

const respostaDaIa = z.object({
  fornecedor: z.string().trim().min(1).max(120).nullable().catch(null),
  chaveAcesso: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length === 44)
    .nullable()
    .catch(null),
  emitidaEm: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .catch(null),
  total: numeroPositivo,
  itens: z
    .array(
      z.object({
        descricao: z.string().trim().min(1).max(200),
        barcode: z
          .string()
          .trim()
          .regex(/^\d{8,14}$/)
          .nullable()
          .catch(null),
        quantidade: numeroPositivo,
        custoUnitario: z
          .number()
          .finite()
          .min(0)
          .max(9_999_999)
          .nullable()
          .catch(null),
        totalLinha: numeroPositivo,
      }),
    )
    .max(MAXIMO_ITENS_EXTRAIDOS),
});

type RespostaDaIa = z.infer<typeof respostaDaIa>;

/**
 * A soma das linhas bate com o total que o próprio documento declara?
 *
 * É a melhor evidência barata de que a leitura está coerente: um modelo que
 * inventou número dificilmente produz linhas que fecham no total impresso.
 * Não serve para corrigir nada — serve para a tela AVISAR quando não fecha.
 */
export function somaDasLinhasFechaComTotal(nota: RespostaDaIa): boolean | null {
  if (nota.total === null) return null;
  const linhas = nota.itens.map((i) => i.totalLinha);
  if (linhas.some((v) => v === null)) return null;

  const soma = (linhas as number[]).reduce((s, v) => s + v, 0);
  // Um centavo de folga por linha cobre arredondamento do próprio documento.
  const folga = Math.max(0.05, nota.itens.length * 0.01);
  return Math.abs(soma - nota.total) <= folga;
}

export type LeituraPorIa = {
  nota: NotaExtraida;
  /** null quando não deu para conferir (documento sem total, por exemplo). */
  somaConfere: boolean | null;
};

/**
 * Manda o arquivo para o modelo e devolve a nota extraída.
 * Lança `IaIndisponivel` (falha de configuração/rede/API) ou `IaSemProdutos`
 * (respondeu, mas sem nenhum item reconhecível).
 */
export async function lerNotaComIa(
  bytes: Uint8Array,
  mimeType: string,
): Promise<LeituraPorIa> {
  const chave = process.env.GEMINI_API_KEY;
  if (!chave) {
    throw new IaIndisponivel("GEMINI_API_KEY não configurada");
  }

  const corpo = {
    contents: [
      {
        parts: [
          { text: PROMPT },
          {
            inline_data: {
              mime_type: mimeType,
              data: Buffer.from(bytes).toString("base64"),
            },
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: ESQUEMA_DA_RESPOSTA,
      // Extração de documento não é tarefa criativa: o mesmo arquivo deve
      // dar o mesmo resultado.
      temperature: 0,
    },
  };

  let resposta: Response;
  try {
    resposta = await fetch(`${ENDPOINT}/${MODELO}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": chave },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });
  } catch (erro) {
    // O motivo vai para o log do servidor: sem ele, uma falha de rede fica
    // indistinguível de um tempo esgotado ou de um bloqueio de saída, e o
    // diagnóstico vira adivinhação.
    console.error("[ia-visao] falha ao chamar o modelo:", erro);
    throw new IaIndisponivel(
      erro instanceof Error ? erro.message : "falha de rede",
    );
  }

  if (!resposta.ok) {
    // A mensagem da API pode conter detalhes da conta: fica no log do
    // servidor, nunca na tela do usuário.
    console.error(
      `[ia-visao] ${MODELO} respondeu ${resposta.status}`,
      (await resposta.text()).slice(0, 300),
    );
    throw new IaIndisponivel(`modelo respondeu ${resposta.status}`);
  }

  let texto: string | undefined;
  try {
    const dados = (await resposta.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    texto = dados.candidates?.[0]?.content?.parts?.[0]?.text;
  } catch {
    throw new IaIndisponivel("resposta ilegível do modelo");
  }
  if (!texto) throw new IaIndisponivel("resposta vazia do modelo");

  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch {
    throw new IaIndisponivel("o modelo não devolveu JSON");
  }

  return interpretarRespostaDaIa(bruto);
}

/**
 * Valida e converte o que o modelo devolveu.
 *
 * Separado da chamada de rede de propósito: é a parte que decide o que entra
 * no estoque do usuário, e precisa ser testável sem depender da API — e sem
 * gastar cota.
 */
export function interpretarRespostaDaIa(bruto: unknown): LeituraPorIa {
  const validada = respostaDaIa.safeParse(bruto);
  if (!validada.success) {
    throw new IaIndisponivel("resposta do modelo fora do formato esperado");
  }

  const nota = validada.data;
  if (nota.itens.length === 0) {
    throw new IaSemProdutos("nenhum item reconhecido");
  }

  return {
    somaConfere: somaDasLinhasFechaComTotal(nota),
    nota: {
      origem: "ia",
      fornecedor: nota.fornecedor,
      chaveAcesso: nota.chaveAcesso,
      emitidaEm: nota.emitidaEm,
      total: nota.total,
      itens: nota.itens.map((item) => ({
        descricao: item.descricao,
        barcode: item.barcode,
        // Sem quantidade legível, 1 é o palpite mínimo e visível na tela —
        // diferente de inventar um custo, que passaria despercebido.
        quantidade: item.quantidade ?? 1,
        custoUnitario: item.custoUnitario,
        totalLinha: item.totalLinha,
      })),
    },
  };
}
