"use server";

import {
  escolherProduto,
  type ProdutoCatalogo,
} from "@/lib/compras/correspondencia";
import { extrairNota } from "@/lib/compras/extrair";
import {
  TAMANHO_MAXIMO_ARQUIVO,
  type ItemConferencia,
  type NotaConferencia,
} from "@/lib/compras/tipos";
import { checkRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

/**
 * Importar a nota de um arquivo (plano 08, fase G2b).
 *
 * Recebe o PDF do DANFE ou o XML da NF-e, extrai os itens no PRÓPRIO
 * servidor (nada sai daqui, custo zero) e liga cada item ao catálogo do
 * usuário. O resultado só preenche a tela de conferência: NADA é gravado
 * aqui — o usuário confere item a item e confirma, como na entrada manual.
 */

/** Teto do catálogo lido de uma vez para casar os nomes. */
const LIMITE_CATALOGO = 5000;

export type ImportarNotaResult =
  | { ok: true; nota: NotaConferencia }
  | { ok: false; error: string };

export async function importarNotaDeArquivo(
  formData: FormData,
): Promise<ImportarNotaResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sessão expirada. Entre novamente." };
  }

  const limite = await checkRateLimit("importar-nota");
  if (!limite.ok) {
    return { ok: false, error: limite.message };
  }

  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { ok: false, error: "Escolha o arquivo da nota." };
  }
  // Confere o tamanho ANTES de carregar o conteúdo na memória.
  if (arquivo.size > TAMANHO_MAXIMO_ARQUIVO) {
    return { ok: false, error: "O arquivo é grande demais para uma nota." };
  }

  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const extracao = await extrairNota(bytes);
  if (!extracao.ok) {
    return { ok: false, error: extracao.erro };
  }
  const nota = extracao.nota;

  // ── Motor de correspondência ────────────────────────────────────────
  // Duas consultas resolvem a nota inteira (uma pelos códigos de barras e
  // uma pelo catálogo), em vez de uma ida ao banco por item.
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

  return { ok: true, nota: { ...nota, itens } };
}
