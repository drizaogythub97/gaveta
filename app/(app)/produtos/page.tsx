import { Box, Check, Pencil, Plus, Tag, UtensilsCrossed } from "lucide-react";
import Link from "next/link";

import { BuscaNome } from "@/components/app/busca-nome";
import { ConfirmDeleteButton } from "@/components/app/confirm-delete-button";
import { FiltroMulti } from "@/components/app/filtro-multi";
import { Paginacao } from "@/components/app/paginacao";
import { RegiaoEmEspera } from "@/components/app/regiao-em-espera";
import { buttonVariants } from "@/components/ui/button";
import { escaparLike } from "@/lib/db/like";
import { formatBRL, formatQuantity } from "@/lib/products/format";
import { listarTags } from "@/lib/products/tags";
import { createClient } from "@/lib/supabase/server";
import type { Product, ProductTag, ProductWithTags } from "@/lib/types/db";
import { cn } from "@/lib/utils";

import { deleteProduct } from "./actions";

export const metadata = {
  title: "Produtos",
};

/**
 * Produtos por página. A listagem antes trazia o catálogo INTEIRO, com os
 * códigos de barras aninhados — com centenas de itens, a tela ficava pesada
 * no celular. O corte é feito no banco (range + count exato), não no
 * cliente.
 */
const PAGE_SIZE = 15;

function pickString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** O filtro de categorias viaja repetido na URL (`?tag=a&tag=b`). */
function pickAll(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function parsePage(value: string | string[] | undefined): number {
  const n = Number.parseInt(pickString(value) ?? "1", 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}


type ProductRow = Product & {
  product_barcodes: { barcode: string }[] | null;
  product_tag_links: { tag_id: string }[] | null;
};

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const tags = await listarTags(supabase);
  // Só vale filtro por categoria que existe: parâmetro inventado na URL é
  // descartado em vez de devolver uma lista vazia sem explicação.
  const tagsAtuais = pickAll(params.tag).filter((id) =>
    tags.some((t) => t.id === id),
  );
  const termo = (pickString(params.q) ?? "").trim();

  // Quando há filtro de categoria, a página vem dos vínculos: o PostgREST não
  // pagina direito por tabela aninhada, então os ids saem primeiro. Várias
  // categorias marcadas somam (OU): o produto entra se tiver QUALQUER uma
  // delas — decisão do dono do produto.
  let idsDaTag: string[] | null = null;
  if (tagsAtuais.length > 0) {
    const { data } = await supabase
      .from("product_tag_links")
      .select("product_id")
      .in("tag_id", tagsAtuais);
    idsDaTag = [
      ...new Set(
        ((data ?? []) as { product_id: string }[]).map((l) => l.product_id),
      ),
    ];
  }

  const paginaPedida = parsePage(params.page);
  const offset = (paginaPedida - 1) * PAGE_SIZE;

  // Categoria sem nenhum produto: não vale ir ao banco só para receber uma
  // lista vazia (e `in.()` com lista vazia não é consulta válida).
  const semResultado = idsDaTag !== null && idsDaTag.length === 0;

  let query = supabase
    .from("products")
    .select(
      "id, user_id, name, price, cost_price, track_stock, stock_quantity, created_at, updated_at, product_barcodes(barcode), product_tag_links(tag_id)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false });
  if (idsDaTag !== null && idsDaTag.length > 0) {
    query = query.in("id", idsDaTag);
  }
  if (termo !== "") {
    // A busca corta no banco, não no cliente: só assim a contagem e a
    // paginação continuam certas com o catálogo inteiro.
    query = query.ilike("name", `%${escaparLike(termo)}%`);
  }

  const { data, error, count } = semResultado
    ? { data: [], error: null, count: 0 }
    : await query.range(offset, offset + PAGE_SIZE - 1);

  // O total vem do `count` da própria consulta (exato, com o filtro
  // aplicado); a página é limitada depois, para "?page=99" mostrar a última
  // em vez de uma tela vazia.
  const totalProdutos = count ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(totalProdutos / PAGE_SIZE));
  const paginaAtual = Math.min(paginaPedida, totalPaginas);

  const porId = new Map(tags.map((t) => [t.id, t]));
  const products: ProductWithTags[] = ((data ?? []) as ProductRow[]).map(
    (p) => ({
      ...p,
      barcodes: (p.product_barcodes ?? []).map((b) => b.barcode),
      tags: (p.product_tag_links ?? [])
        .map((l) => porId.get(l.tag_id))
        .filter((t): t is ProductTag => Boolean(t)),
    }),
  );

  const temFiltro = tagsAtuais.length > 0 || termo !== "";
  const semNenhumProduto = totalProdutos === 0 && !temFiltro;

  // Confirmação de quem acabou de salvar e foi trazido para cá. O aviso não
  // pode nascer no formulário: ele some junto com a tela que sai.
  const salvo = pickString(params.salvo);
  const nomeSalvo = pickString(params.nome)?.slice(0, 60);
  const confirmacao =
    salvo === "novo"
      ? `Produto ${nomeSalvo ? `“${nomeSalvo}” ` : ""}cadastrado.`
      : salvo === "editado"
        ? `Produto ${nomeSalvo ? `“${nomeSalvo}” ` : ""}atualizado.`
        : null;

  return (
    <section className="minimal:max-sm:gap-4 flex flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="minimal:max-sm:text-xl text-3xl font-semibold tracking-tight">
            Produtos
          </h1>
          <p className="minimal:max-sm:text-sm minimal:max-sm:mt-1 text-muted-foreground mt-2 text-lg">
            Cadastre e organize o que você vende.
          </p>
        </div>
        <Link
          href="/produtos/novo"
          className={cn(
            buttonVariants(),
            "minimal:max-sm:h-11 minimal:max-sm:text-base h-14 px-6 text-lg font-medium sm:self-start",
          )}
        >
          <Plus aria-hidden="true" className="size-5" />
          Novo produto
        </Link>
      </header>

      {confirmacao ? (
        <p
          role="status"
          className="border-primary/35 bg-primary/10 text-primary flex items-center gap-2 rounded-xl border px-4 py-3 text-base font-medium"
        >
          <Check aria-hidden="true" className="size-5 shrink-0" />
          {confirmacao}
        </p>
      ) : null}

      {!semNenhumProduto ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
          <div className="sm:max-w-sm sm:flex-1">
            <BuscaNome
              termoAtual={termo}
              rotulo="Buscar por nome"
              placeholder="Comece a digitar…"
              dica="A lista vai se ajustando conforme você digita."
            />
          </div>
          {tags.length > 0 ? (
            <div>
              <FiltroMulti
                param="tag"
                rotulo="Filtrar por categoria"
                selecionados={tagsAtuais}
                textoVazio="Todas as categorias"
                opcoes={tags.map((t) => ({ value: t.id, label: t.name }))}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="text-destructive text-base" role="alert">
          Não foi possível carregar os produtos.
        </p>
      ) : semNenhumProduto ? (
        <EmptyState />
      ) : products.length === 0 ? (
        <div className="bg-muted/40 flex flex-col items-center gap-3 rounded-xl p-8 text-center">
          <p className="text-base">
            {termo !== ""
              ? `Nenhum produto com “${termo}” no nome${tagsAtuais.length > 0 ? " nas categorias marcadas" : ""}.`
              : "Nenhum produto nas categorias marcadas."}
          </p>
          <Link
            href="/produtos"
            className={cn(
              buttonVariants({ variant: "outline" }),
              "h-12 px-5 text-base",
            )}
          >
            Limpar filtros
          </Link>
        </div>
      ) : (
        <RegiaoEmEspera>
          <ul className="minimal:max-sm:gap-2 flex flex-col gap-3">
            {products.map((p) => (
              <li
                key={p.id}
                className="minimal:max-sm:gap-2 minimal:max-sm:p-3.5 ring-foreground/10 bg-card flex flex-col gap-3 rounded-xl p-4 ring-1 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="minimal:max-sm:text-base text-foreground text-xl font-semibold">
                      {p.name}
                    </span>
                    <StockBadge product={p} />
                  </div>
                  {p.tags.length > 0 ? (
                    <ul className="flex flex-wrap gap-2">
                      {p.tags.map((tag) => (
                        <li
                          key={tag.id}
                          className="bg-muted text-muted-foreground flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm"
                        >
                          <Tag aria-hidden="true" className="size-3.5" />
                          {tag.name}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="minimal:max-sm:text-xs minimal:max-sm:gap-x-3 text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-base">
                    <span className="minimal:max-sm:text-sm text-foreground text-lg font-medium">
                      {formatBRL(p.price)}
                    </span>
                    {p.cost_price !== null ? (
                      <span
                        aria-label={`Preço de custo ${formatBRL(p.cost_price)}`}
                      >
                        Custo: {formatBRL(p.cost_price)}
                      </span>
                    ) : null}
                    {p.barcodes.length > 0 ? (
                      <span
                        aria-label={`Códigos de barras ${p.barcodes.join(", ")}`}
                      >
                        {p.barcodes.length === 1 ? "Código: " : "Códigos: "}
                        <span className="font-mono">
                          {p.barcodes.join(" · ")}
                        </span>
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/produtos/${p.id}/editar`}
                    className={cn(
                      buttonVariants({ variant: "outline" }),
                      "minimal:max-sm:h-10 minimal:max-sm:px-3 minimal:max-sm:text-sm h-12 flex-1 px-4 text-base sm:flex-initial",
                    )}
                    aria-label={`Editar ${p.name}`}
                  >
                    <Pencil aria-hidden="true" className="size-4" />
                    Editar
                  </Link>
                  <ConfirmDeleteButton
                    id={p.id}
                    productName={p.name}
                    action={deleteProduct}
                  />
                </div>
              </li>
            ))}
          </ul>
          <Paginacao
            paginaAtual={paginaAtual}
            totalPaginas={totalPaginas}
            total={totalProdutos}
            singular="produto"
            plural="produtos"
            rotulo="Páginas da lista de produtos"
          />
        </RegiaoEmEspera>
      )}
    </section>
  );
}

function EmptyState() {
  return (
    <div className="minimal:max-sm:p-6 bg-muted/40 flex flex-col items-center gap-3 rounded-xl p-10 text-center">
      <Box aria-hidden="true" className="text-muted-foreground size-10" />
      <h2 className="minimal:max-sm:text-base text-xl font-medium">
        Nenhum produto cadastrado ainda
      </h2>
      <p className="text-muted-foreground text-base">
        Crie seu primeiro produto para começar a vender.
      </p>
      <Link
        href="/produtos/novo"
        className={cn(
          buttonVariants(),
          "minimal:max-sm:h-11 minimal:max-sm:text-base mt-2 h-14 px-6 text-lg font-medium",
        )}
      >
        <Plus aria-hidden="true" className="size-5" />
        Cadastrar produto
      </Link>
    </div>
  );
}

function StockBadge({ product }: { product: Product }) {
  if (!product.track_stock) {
    return (
      <span
        className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
        aria-label="Produto sob demanda, sem controle de estoque"
      >
        <UtensilsCrossed aria-hidden="true" className="size-4" />
        Sob demanda
      </span>
    );
  }

  const qty = product.stock_quantity ?? 0;
  return (
    <span
      className="bg-primary/10 text-primary inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium"
      aria-label={`Estoque: ${formatQuantity(qty)}`}
    >
      <Box aria-hidden="true" className="size-4" />
      Estoque: {formatQuantity(qty)}
    </span>
  );
}
