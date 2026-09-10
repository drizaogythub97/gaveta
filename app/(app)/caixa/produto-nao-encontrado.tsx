"use client";

import { PackagePlus, Zap } from "lucide-react";
import { useId, useState, useTransition } from "react";

import { BarcodeCameraButton } from "@/components/app/barcode-camera-button";
import { TagPicker } from "@/components/app/tag-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  digitsToBRL,
  digitsToDecimalString,
  digitsToNumber,
  parseDecimalPtBR,
  sanitizeDigits,
} from "@/lib/products/format";
import type { Product, ProductTag } from "@/lib/types/db";

import { criarProdutoRapido } from "../produtos/actions";

/**
 * O que fazer quando o cliente traz um produto que ainda não existe.
 *
 * Antes só havia uma saída: o **item avulso** — nome, valor e quantidade,
 * gravados na venda sem produto por trás. Ele resolve a pressa e vaza no
 * relatório: item avulso não tem custo, não baixa estoque e **nunca poderá
 * ter custo** (não há produto de onde tirá-lo), então fica para sempre no
 * aviso "faltam produtos sem custo" do Fechamento. Medido em 2026-09-10:
 * 19 itens assim, contra 44 corrigíveis.
 *
 * Por isso a tela passa a oferecer as DUAS saídas, com o cadastro na
 * frente: quem tem um minuto cadastra o produto e vende com custo, estoque
 * e categoria; quem tem o cliente esperando continua tendo o avulso a um
 * toque. Forçar o cadastro seria travar o caixa — e caixa travado é o que
 * faz alguém desistir do sistema.
 */
export function ProdutoNaoEncontrado({
  termo,
  tags,
  desabilitado,
  aoCadastrar,
  aoVenderAvulso,
  aoCancelar,
  aoCriarCategoria,
}: {
  /** O que a pessoa digitou ou bipou e não achou. */
  termo: string;
  /** Categorias já criadas — o produto novo pode nascer com elas. */
  tags: ProductTag[];
  desabilitado: boolean;
  /** Produto cadastrado: entra no carrinho com a quantidade informada. */
  aoCadastrar: (produto: Product, quantidade: number) => void;
  aoVenderAvulso: (nome: string, valor: number, quantidade: number) => void;
  aoCancelar: () => void;
  aoCriarCategoria: (
    nome: string,
  ) => Promise<{ tag?: ProductTag; error?: string }>;
}) {
  // Termo que parece código de barras já entra no campo do código, e o nome
  // fica em branco para a pessoa escrever — foi assim que a entrada por nota
  // resolveu o mesmo problema.
  const pareceCodigo = /^\d{8,14}$/.test(termo);

  const [modo, setModo] = useState<"cadastrar" | "avulso">("cadastrar");
  const [nome, setNome] = useState(pareceCodigo ? "" : termo);
  const [codigo, setCodigo] = useState(pareceCodigo ? termo : "");
  const [precoDigits, setPrecoDigits] = useState("");
  const [custoDigits, setCustoDigits] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const [controlaEstoque, setControlaEstoque] = useState(true);
  const [estoqueAtual, setEstoqueAtual] = useState("");
  const [categorias, setCategorias] = useState<{
    tagIds: string[];
    newTags: string[];
  }>({ tagIds: [], newTags: [] });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciarSalvamento] = useTransition();

  const nomeId = useId();
  const codigoId = useId();
  const precoId = useId();
  const custoId = useId();
  const qtdId = useId();
  const estoqueId = useId();
  const avulsoValorId = useId();
  const avulsoQtdId = useId();

  const ocupado = desabilitado || salvando;

  function cadastrar() {
    const qtd = parseDecimalPtBR(quantidade);
    if (nome.trim() === "") {
      setErro("Informe o nome do produto.");
      return;
    }
    if (precoDigits === "" || digitsToNumber(precoDigits) <= 0) {
      setErro("Informe por quanto você vende este produto.");
      return;
    }
    if (!Number.isFinite(qtd) || qtd <= 0) {
      setErro("Informe uma quantidade válida.");
      return;
    }

    setErro(null);
    iniciarSalvamento(async () => {
      const resultado = await criarProdutoRapido({
        name: nome,
        barcodes: codigo.trim() === "" ? [] : [codigo.trim()],
        price: digitsToDecimalString(precoDigits),
        costPrice:
          custoDigits === "" ? undefined : digitsToDecimalString(custoDigits),
        trackStock: controlaEstoque ? "true" : "false",
        // Quantas unidades existem AGORA, antes desta venda: a venda desconta
        // logo em seguida. Em branco = o que está sendo vendido, que é o
        // palpite certo para quem acabou de receber a mercadoria.
        stockQuantity: controlaEstoque
          ? estoqueAtual.trim() === ""
            ? quantidade
            : estoqueAtual
          : undefined,
        tagIds: categorias.tagIds,
        newTags: categorias.newTags,
      });

      if (resultado.error || !resultado.produto) {
        setErro(resultado.error ?? "Não foi possível cadastrar o produto.");
        return;
      }
      aoCadastrar(resultado.produto, qtd);
    });
  }

  function venderAvulso() {
    const valor = digitsToNumber(precoDigits);
    const qtd = parseDecimalPtBR(quantidade);
    if (nome.trim() === "") {
      setErro("Informe o nome do item.");
      return;
    }
    if (!Number.isFinite(valor) || valor <= 0) {
      setErro("Informe um valor válido.");
      return;
    }
    if (!Number.isFinite(qtd) || qtd <= 0) {
      setErro("Informe uma quantidade válida.");
      return;
    }
    setErro(null);
    aoVenderAvulso(nome.trim(), Math.round(valor * 100) / 100, qtd);
  }

  return (
    <div className="border-border flex flex-col gap-3 rounded-lg border border-dashed p-4">
      <p className="text-base">
        Nenhum produto encontrado para{" "}
        <strong className="font-medium">&ldquo;{termo}&rdquo;</strong>.
      </p>

      {/* A escolha fica explícita, e o cadastro é o caminho de frente. */}
      <div
        role="group"
        aria-label="O que fazer com este item"
        className="flex flex-col gap-2 sm:flex-row"
      >
        <Button
          type="button"
          variant={modo === "cadastrar" ? "default" : "outline"}
          onClick={() => {
            setModo("cadastrar");
            setErro(null);
          }}
          aria-pressed={modo === "cadastrar"}
          className="minimal:max-sm:h-11 h-12 flex-1 justify-center gap-2 text-base"
        >
          <PackagePlus aria-hidden="true" className="size-5" />
          Cadastrar e vender
        </Button>
        <Button
          type="button"
          variant={modo === "avulso" ? "default" : "outline"}
          onClick={() => {
            setModo("avulso");
            setErro(null);
          }}
          aria-pressed={modo === "avulso"}
          className="minimal:max-sm:h-11 h-12 flex-1 justify-center gap-2 text-base"
        >
          <Zap aria-hidden="true" className="size-5" />
          Só vender agora
        </Button>
      </div>

      {modo === "cadastrar" ? (
        <p className="text-muted-foreground text-sm">
          O produto passa a existir no Gaveta: entra no estoque, tem custo e
          aparece certo no Fechamento.
        </p>
      ) : (
        <p className="text-muted-foreground text-sm">
          Vende agora sem cadastrar. Item avulso{" "}
          <strong className="text-foreground font-medium">
            não baixa estoque e fica sem custo
          </strong>{" "}
          no Fechamento — e isso não tem como ser corrigido depois.
        </p>
      )}

      {erro ? (
        <p role="alert" className="text-destructive text-base font-medium">
          {erro}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1 sm:col-span-2">
          <Label htmlFor={nomeId} className="text-sm">
            {modo === "cadastrar" ? "Nome do produto" : "Nome do item"}
          </Label>
          <Input
            id={nomeId}
            type="text"
            autoComplete="off"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            disabled={ocupado}
            className="h-12 text-base"
          />
        </div>

        {modo === "cadastrar" ? (
          <div className="flex flex-col gap-1 sm:col-span-2">
            <Label htmlFor={codigoId} className="text-sm">
              Código de barras (opcional)
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id={codigoId}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                disabled={ocupado}
                className="h-12 flex-1 font-mono text-base"
              />
              <BarcodeCameraButton
                onDetect={(lido) => setCodigo(lido)}
                rotulo="Bipar"
              />
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-1">
          <Label
            htmlFor={modo === "cadastrar" ? precoId : avulsoValorId}
            className="text-sm"
          >
            {modo === "cadastrar" ? "Preço de venda" : "Valor"}
          </Label>
          <Input
            id={modo === "cadastrar" ? precoId : avulsoValorId}
            type="text"
            inputMode="numeric"
            value={precoDigits === "" ? "" : digitsToBRL(precoDigits)}
            onChange={(e) => setPrecoDigits(sanitizeDigits(e.target.value))}
            placeholder="R$ 0,00"
            disabled={ocupado}
            className="h-12 text-base"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label
            htmlFor={modo === "cadastrar" ? qtdId : avulsoQtdId}
            className="text-sm"
          >
            Quantidade
          </Label>
          <Input
            id={modo === "cadastrar" ? qtdId : avulsoQtdId}
            type="text"
            inputMode="decimal"
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            disabled={ocupado}
            className="h-12 text-base"
          />
        </div>

        {modo === "cadastrar" ? (
          <>
            <div className="flex flex-col gap-1">
              <Label htmlFor={custoId} className="text-sm">
                Quanto custou para você (opcional)
              </Label>
              <Input
                id={custoId}
                type="text"
                inputMode="numeric"
                value={custoDigits === "" ? "" : digitsToBRL(custoDigits)}
                onChange={(e) => setCustoDigits(sanitizeDigits(e.target.value))}
                placeholder="R$ 0,00"
                disabled={ocupado}
                className="h-12 text-base"
              />
              <p className="text-muted-foreground text-xs">
                Sem o custo, esta venda entra no Fechamento como lucro por cima.
              </p>
            </div>

            {controlaEstoque ? (
              <div className="flex flex-col gap-1">
                <Label htmlFor={estoqueId} className="text-sm">
                  Quantas você tem agora
                </Label>
                <Input
                  id={estoqueId}
                  type="text"
                  inputMode="decimal"
                  value={estoqueAtual}
                  onChange={(e) => setEstoqueAtual(e.target.value)}
                  placeholder={quantidade}
                  disabled={ocupado}
                  className="h-12 text-base"
                />
                <p className="text-muted-foreground text-xs">
                  Antes desta venda. Em branco, considero o que está sendo
                  vendido.
                </p>
              </div>
            ) : null}

            <label className="flex items-center gap-3 text-base sm:col-span-2">
              <input
                type="checkbox"
                checked={controlaEstoque}
                onChange={(e) => setControlaEstoque(e.target.checked)}
                disabled={ocupado}
                className="size-5"
              />
              Controlar o estoque deste produto
            </label>

            <div className="sm:col-span-2">
              <TagPicker
                disponiveis={tags}
                onChange={setCategorias}
                aoCriar={aoCriarCategoria}
              />
            </div>
          </>
        ) : null}
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={aoCancelar}
          disabled={ocupado}
          className="minimal:max-sm:h-10 minimal:max-sm:px-3 minimal:max-sm:text-sm h-12 px-5 text-base"
        >
          Cancelar
        </Button>
        <Button
          type="button"
          onClick={modo === "cadastrar" ? cadastrar : venderAvulso}
          disabled={ocupado}
          className="minimal:max-sm:h-10 minimal:max-sm:px-3 minimal:max-sm:text-sm h-12 px-5 text-base"
        >
          {modo === "cadastrar"
            ? salvando
              ? "Cadastrando…"
              : "Cadastrar e adicionar"
            : "Adicionar avulso"}
        </Button>
      </div>
    </div>
  );
}
