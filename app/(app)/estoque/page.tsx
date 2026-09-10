import { FileText, History } from "lucide-react";

import { LinkAcao } from "@/components/app/link-acao";
import { Paginacao } from "@/components/app/paginacao";
import { RegiaoEmEspera } from "@/components/app/regiao-em-espera";
import { buttonVariants } from "@/components/ui/button";
import {
  LOW_STOCK_THRESHOLD,
  dayEndISO,
  dayStartISO,
} from "@/lib/dashboard/dates";
import { escaparLike, valorParaOr } from "@/lib/db/like";
import {
  ESTOQUE_PAGE_SIZE,
  lerFiltrosEstoque,
  temFiltroEstoque,
} from "@/lib/estoque/filtros";
import { todasAsLinhas } from "@/lib/db/paginado";
import { createClient } from "@/lib/supabase/server";
import type { Product } from "@/lib/types/db";
import { cn } from "@/lib/utils";

import { FiltrosDoEstoque } from "./filtros-estoque";
import { StockRow } from "./stock-row";

export const metadata = {
  title: "Estoque",
};

const COLUNAS =
  "id, user_id, name, price, cost_price, track_stock, stock_quantity, created_at, updated_at";

/**
 * Quantos ids de código de barras cabem na URL da consulta seguinte.
 *
 * Não é gosto: é o que o gateway aceita. Ver a medição no comentário do uso.
 */
const TETO_CODIGOS = 200;

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filtros = lerFiltrosEstoque(params);
  const supabase = await createClient();

  // A busca casa por nome OU por código de barras — é o que permite achar o
  // produto bipando com a câmera. Os códigos moram noutra tabela, então os
  // ids saem primeiro e entram na consulta como alternativa ao nome.
  let idsPorCodigo: string[] = [];
  let codigosTruncados = false;
  if (filtros.termo !== "") {
    // Aqui os ids TÊM de passar pela URL: a busca do estoque é "nome OU
    // código de barras", e o `or` do PostgREST não aceita filtro de tabela
    // aninhada — diferente do filtro por categoria em Produtos, que virou
    // subconsulta com `!inner`.
    //
    // Por isso o teto continua, mas agora medido e declarado. Medição de
    // 10/09 contra o gateway do Supabase: 200 ids = URL de 7,5 KB e HTTP
    // 200; 1000 ids = HTTP 400; 2000 ids = HTTP 414 (URI Too Long). Ou
    // seja, buscar os ids "em páginas" sem teto não removeria o corte —
    // trocaria um corte silencioso por uma página quebrada.
    const { linhas, truncou } = await todasAsLinhas<{ product_id: string }>(
      (de, ate) =>
        supabase
          .from("product_barcodes")
          .select("product_id")
          .ilike("barcode", `%${escaparLike(filtros.termo)}%`)
          .range(de, ate),
      { maximo: TETO_CODIGOS },
    );
    idsPorCodigo = [...new Set(linhas.map((l) => l.product_id))];
    // O corte deixa de ser mudo: se bateu no teto, a tela diz.
    codigosTruncados = truncou;
  }

  let query = supabase
    .from("products")
    .select(COLUNAS, { count: "exact" })
    .eq("track_stock", true)
    .order("name", { ascending: true });

  if (filtros.termo !== "") {
    const porNome = `name.ilike.${valorParaOr(`%${escaparLike(filtros.termo)}%`)}`;
    const alternativas =
      idsPorCodigo.length > 0
        ? `${porNome},id.in.(${idsPorCodigo.join(",")})`
        : porNome;
    query = query.or(alternativas);
  }

  // As bordas do dia saem no fuso do servidor (UTC na Vercel) — mesma
  // ressalva do Financeiro, documentada em `lib/dashboard/dates.ts`.
  const inicio = filtros.de === "" ? null : dayStartISO(filtros.de);
  const fim = filtros.ate === "" ? null : dayEndISO(filtros.ate);
  if (inicio) query = query.gte("created_at", inicio);
  if (fim) query = query.lte("created_at", fim);

  if (filtros.min !== null) query = query.gte("stock_quantity", filtros.min);
  if (filtros.max !== null) query = query.lte("stock_quantity", filtros.max);
  if (filtros.soBaixo) {
    query = query.lte("stock_quantity", LOW_STOCK_THRESHOLD);
  }

  const offset = (filtros.pagina - 1) * ESTOQUE_PAGE_SIZE;
  const { data, error, count } = await query.range(
    offset,
    offset + ESTOQUE_PAGE_SIZE - 1,
  );

  // O total vem do `count` da própria consulta (exato, com o filtro
  // aplicado); a página é limitada depois, para "?page=99" mostrar a última
  // em vez de uma tela vazia.
  const total = count ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / ESTOQUE_PAGE_SIZE));
  const paginaAtual = Math.min(filtros.pagina, totalPaginas);
  const products = (data ?? []) as Product[];
  const comFiltro = temFiltroEstoque(filtros);

  return (
    <section className="minimal:max-sm:gap-4 flex flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="minimal:max-sm:text-xl text-3xl font-semibold tracking-tight">
            Estoque
          </h1>
          <p className="minimal:max-sm:text-sm minimal:max-sm:mt-1 text-muted-foreground mt-2 text-lg">
            Atualize quantidades e registre entradas dos produtos que você
            controla por estoque. Itens sob demanda ficam em{" "}
            <span className="text-foreground font-medium">Produtos</span>.
          </p>
        </div>
        <div className="flex gap-2">
          <LinkAcao
            href="/estoque/compras/nova"
            className="border-border hover:bg-muted inline-flex h-12 w-fit flex-1 shrink-0 items-center justify-center gap-2 rounded-lg border px-4 text-base font-medium transition-colors sm:flex-initial"
            icone={<FileText aria-hidden="true" className="size-5" />}
          >
            Entrada por nota
          </LinkAcao>
          <LinkAcao
            href="/estoque/movimentacoes"
            className="border-border hover:bg-muted inline-flex h-12 w-fit flex-1 shrink-0 items-center justify-center gap-2 rounded-lg border px-4 text-base font-medium transition-colors sm:flex-initial"
            icone={<History aria-hidden="true" className="size-5" />}
          >
            Ver movimentação
          </LinkAcao>
        </div>
      </header>

      <FiltrosDoEstoque filtros={filtros} />

      {error ? (
        <p className="text-destructive text-base" role="alert">
          Não foi possível carregar o estoque.
        </p>
      ) : products.length === 0 ? (
        <div className="bg-muted/40 flex flex-col items-center gap-3 rounded-xl p-8 text-center">
          <p className="text-base">
            {comFiltro
              ? "Nenhum produto bateu com os filtros."
              : "Nenhum produto controlado por estoque ainda."}
          </p>
          {comFiltro ? (
            <LinkAcao
              href="/estoque"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "h-12 px-5 text-base",
              )}
            >
              Limpar filtros
            </LinkAcao>
          ) : null}
        </div>
      ) : (
        <RegiaoEmEspera>
          {/* A contagem some quando a paginação aparece: ela já diz o total,
              e dois números iguais lado a lado só confundem. Com uma página
              só, a barra não é renderizada e a contagem faz falta — foi ela
              que a tela sempre mostrou. */}
          {codigosTruncados ? (
            <p
              className="ring-foreground/10 bg-card text-foreground rounded-xl p-4 text-base ring-1"
              role="status"
            >
              Muitos códigos de barras combinam com “{filtros.termo}”. A busca
              por código considerou os {TETO_CODIGOS} primeiros — digite mais
              números para encontrar o produto certo.
            </p>
          ) : null}
          {totalPaginas === 1 ? (
            <p className="text-muted-foreground text-base" aria-live="polite">
              {total} {total === 1 ? "produto" : "produtos"} no recorte atual.
            </p>
          ) : null}
          <ul className="flex flex-col gap-3">
            {products.map((p) => (
              <StockRow key={p.id} product={p} />
            ))}
          </ul>
          <Paginacao
            paginaAtual={paginaAtual}
            totalPaginas={totalPaginas}
            total={total}
            singular="produto"
            plural="produtos"
            rotulo="Páginas da lista do estoque"
          />
        </RegiaoEmEspera>
      )}
    </section>
  );
}
