"use server";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  escolherProduto,
  type ProdutoCatalogo,
} from "@/lib/compras/correspondencia";
import { extrairNota } from "@/lib/compras/extrair";
import {
  iaLiberadaPara,
  IaIndisponivel,
  IaSemProdutos,
  lerNotaComIa,
} from "@/lib/compras/ia-visao";
import {
  TAMANHO_MAXIMO_ARQUIVO,
  type ItemConferencia,
  type NotaConferencia,
  type NotaExtraida,
} from "@/lib/compras/tipos";
import { checkRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

/**
 * Importar a nota de um arquivo (plano 08, fases G2b, G2c e G2d).
 *
 * Duas portas, com garantias bem diferentes:
 *   • `importarNotaDeArquivo` — XML, PDF-texto e OCR de imagem. Tudo no
 *     PRÓPRIO servidor: o arquivo não sai da infraestrutura do Gaveta.
 *   • `importarNotaComIa` — manda o arquivo para um modelo de visão FORA
 *     daqui. Por isso é acionada só quando a pessoa pede, e só para as
 *     contas liberadas.
 *
 * As duas terminam igual: o resultado apenas PREENCHE a tela de conferência.
 * Nada é gravado aqui — quem confirma é sempre a pessoa.
 */

/** Teto do catálogo lido de uma vez para casar os nomes. */
const LIMITE_CATALOGO = 5000;

export type ImportarNotaResult =
  | { ok: true; nota: NotaConferencia; avisoDeSoma?: boolean }
  | { ok: false; error: string };

/** Sessão + arquivo dentro dos limites. Vale para as duas portas. */
async function receberArquivo(
  formData: FormData,
): Promise<
  | { ok: true; supabase: SupabaseClient; userId: string; arquivo: File }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sessão expirada. Entre novamente." };
  }

  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { ok: false, error: "Escolha o arquivo da nota." };
  }
  // Confere o tamanho ANTES de carregar o conteúdo na memória.
  if (arquivo.size > TAMANHO_MAXIMO_ARQUIVO) {
    return { ok: false, error: "O arquivo é grande demais para uma nota." };
  }

  return { ok: true, supabase, userId: user.id, arquivo };
}

/**
 * Liga cada item lido ao catálogo do usuário: código de barras → nome
 * parecido → produto novo.
 *
 * Duas consultas resolvem a nota inteira (uma pelos códigos e uma pelo
 * catálogo), em vez de uma ida ao banco por item.
 */
async function casarComCatalogo(
  supabase: SupabaseClient,
  nota: NotaExtraida,
): Promise<NotaConferencia> {
  const codigos = [
    ...new Set(
      nota.itens
        .map((item) => item.barcode)
        .filter((codigo): codigo is string => codigo !== null),
    ),
  ];

  const produtoPorCodigo = new Map<string, string>();
  if (codigos.length > 0) {
    const { data } = await supabase
      .from("product_barcodes")
      .select("barcode, product_id")
      .in("barcode", codigos);
    for (const linha of (data ?? []) as {
      barcode: string;
      product_id: string;
    }[]) {
      produtoPorCodigo.set(linha.barcode, linha.product_id);
    }
  }

  const { data: catalogoData } = await supabase
    .from("products")
    .select("id, name, track_stock")
    .order("name", { ascending: true })
    .limit(LIMITE_CATALOGO);

  const catalogo: ProdutoCatalogo[] = (
    (catalogoData ?? []) as { id: string; name: string; track_stock: boolean }[]
  ).map((produto) => ({
    id: produto.id,
    name: produto.name,
    trackStock: produto.track_stock,
  }));
  const porId = new Map(catalogo.map((produto) => [produto.id, produto]));

  const itens: ItemConferencia[] = nota.itens.map((item) => {
    // (a) código de barras da nota bate com um produto cadastrado.
    const idPorCodigo = item.barcode
      ? produtoPorCodigo.get(item.barcode)
      : undefined;
    const reconhecido = idPorCodigo ? porId.get(idPorCodigo) : undefined;
    if (reconhecido) {
      return {
        ...item,
        status: "reconhecido",
        productId: reconhecido.id,
        productName: reconhecido.name,
        trackStock: reconhecido.trackStock,
      };
    }

    // (b) nome parecido o bastante com o de um produto existente.
    const sugerido = escolherProduto(item.descricao, catalogo);
    if (sugerido) {
      return {
        ...item,
        status: "sugerido",
        productId: sugerido.id,
        productName: sugerido.name,
        trackStock: sugerido.trackStock,
      };
    }

    // (c) não existe no Gaveta: entra como produto novo.
    return {
      ...item,
      status: "novo",
      productId: null,
      productName: null,
      trackStock: true,
    };
  });

  return { ...nota, itens };
}

export async function importarNotaDeArquivo(
  formData: FormData,
): Promise<ImportarNotaResult> {
  const entrada = await receberArquivo(formData);
  if (!entrada.ok) return entrada;

  const limite = await checkRateLimit("importar-nota");
  if (!limite.ok) {
    return { ok: false, error: limite.message };
  }

  const bytes = new Uint8Array(await entrada.arquivo.arrayBuffer());
  const extracao = await extrairNota(bytes);
  if (!extracao.ok) {
    return { ok: false, error: extracao.erro };
  }

  return {
    ok: true,
    nota: await casarComCatalogo(entrada.supabase, extracao.nota),
  };
}

/**
 * Lê a nota com IA de visão (fase G2d). **Manda o arquivo para fora da
 * infraestrutura do Gaveta** — por isso a tela avisa antes, e por isso só
 * as contas liberadas chegam aqui.
 *
 * A checagem de liberação é feita AQUI, no servidor. Esconder o botão na
 * tela é só conveniência: a action é a fronteira de verdade.
 */
export async function importarNotaComIa(
  formData: FormData,
): Promise<ImportarNotaResult> {
  const entrada = await receberArquivo(formData);
  if (!entrada.ok) return entrada;

  if (!iaLiberadaPara(entrada.userId)) {
    // Mensagem igual à de recurso inexistente: quem não tem acesso não
    // precisa saber que existe.
    return { ok: false, error: "Recurso indisponível nesta conta." };
  }

  const limite = await checkRateLimit("ler-nota-com-ia");
  if (!limite.ok) {
    return { ok: false, error: limite.message };
  }

  const tipo = entrada.arquivo.type;
  const aceitos = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
  if (!aceitos.includes(tipo)) {
    return {
      ok: false,
      error: "Para a leitura por IA, envie o PDF ou uma foto (JPG, PNG).",
    };
  }

  const bytes = new Uint8Array(await entrada.arquivo.arrayBuffer());

  try {
    const leitura = await lerNotaComIa(bytes, tipo);
    return {
      ok: true,
      nota: await casarComCatalogo(entrada.supabase, leitura.nota),
      // `false` = a soma das linhas NÃO fecha com o total do documento, o que
      // é o sinal mais barato de leitura incoerente. `null` = não deu para
      // conferir, e aí não há aviso a dar.
      avisoDeSoma: leitura.somaConfere === false,
    };
  } catch (erro) {
    if (erro instanceof IaSemProdutos) {
      return {
        ok: false,
        error:
          "A IA não encontrou produtos neste arquivo. Confira se é a nota certa ou digite os itens abaixo.",
      };
    }
    if (erro instanceof IaIndisponivel) {
      return {
        ok: false,
        error:
          "A leitura por IA falhou agora. Tente de novo em instantes, use o PDF/XML da nota, ou digite os itens.",
      };
    }
    throw erro;
  }
}
