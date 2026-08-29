"use client";

import {
  AlertTriangle,
  Camera,
  HelpCircle,
  Package,
  PackagePlus,
  ScanBarcode,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";

import {
  BarcodeScanner,
  isBarcodeCameraSupported,
} from "@/components/app/barcode-scanner";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { ErrorAlert } from "@/components/auth/form-feedback";
import loaderStyles from "@/components/app/gaveta-loader.module.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useClientFlag } from "@/lib/hooks/use-client-flag";
import {
  digitsToBRL,
  digitsToNumber,
  formatBRL,
  numberToDigits,
  parseDecimalPtBR,
  sanitizeDigits,
} from "@/lib/products/format";
import type { NotaConferencia, StatusItem } from "@/lib/compras/tipos";
import type { Product } from "@/lib/types/db";
import type { PurchaseSource } from "@/lib/types/purchases";

// A busca de produto é a MESMA da frente de caixa (por nome ou por código
// de barras) — sem duplicar lógica de busca.
import { findProductByCode, searchProductsByName } from "../../caixa/actions";

import { registrarCompra } from "./actions";
import { ImportarNota } from "./importar-nota";

type NotaItem = {
  key: string;
  productId: string | null;
  isNew: boolean;
  name: string;
  barcode: string;
  quantity: string;
  costDigits: string;
  salePriceDigits: string;
  trackStock: boolean;
  /** Como o item se ligou ao catálogo (importação da G2b). */
  status: StatusItem;
  /**
   * Descrição como veio na nota (só em item importado). A tela mostra essa
   * linha quando ela difere do nome atual — seja porque casou com um produto
   * de outro nome, seja porque a pessoa editou o nome do produto novo.
   */
  descricaoNota: string | null;
};

function makeKey() {
  return Math.random().toString(36).slice(2, 10);
}

/** Quantidade numérica para o texto do campo (o app lê em pt-BR). */
function quantidadeParaTexto(valor: number): string {
  return String(valor).replace(".", ",");
}

/**
 * Como o item se ligou ao catálogo. O "parecido" é o que mais importa: é o
 * único que pede atenção antes de lançar.
 */
function StatusDoItem({ status }: { status: StatusItem }) {
  if (status === "novo") {
    return (
      <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-sm font-medium text-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
        <PackagePlus aria-hidden="true" className="size-4" />
        Produto novo
      </span>
    );
  }
  if (status === "sugerido") {
    return (
      <span className="border-warning/40 bg-warning/10 text-warning inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-sm font-medium">
        <HelpCircle aria-hidden="true" className="size-4" />
        Parecido — confira
      </span>
    );
  }
  return (
    <span className="bg-primary/10 text-primary inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-medium">
      <Package aria-hidden="true" className="size-4" />
      Já cadastrado
    </span>
  );
}

function hoje(): string {
  const agora = new Date();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${agora.getFullYear()}-${mes}-${dia}`;
}

function lineTotal(item: NotaItem): number {
  const qty = parseDecimalPtBR(item.quantity);
  const cost = digitsToNumber(item.costDigits);
  if (!Number.isFinite(qty) || qty <= 0) return 0;
  return Math.round(qty * cost * 100) / 100;
}

export function NotaForm({ iaLiberada }: { iaLiberada: boolean }) {
  const router = useRouter();

  const [supplier, setSupplier] = useState("");
  const [issuedOn, setIssuedOn] = useState(hoje);
  const [accessKey, setAccessKey] = useState("");

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Product[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [novoNome, setNovoNome] = useState<string | null>(null);
  const [novoBarcode, setNovoBarcode] = useState("");
  const [novoCustoDigits, setNovoCustoDigits] = useState("");
  const [novoPrecoDigits, setNovoPrecoDigits] = useState("");
  const [novoQtd, setNovoQtd] = useState("1");

  const [items, setItems] = useState<NotaItem[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSaving, startSaving] = useTransition();

  // Origem da nota: muda para 'pdf'/'xml' quando os itens vieram de arquivo
  // (fase G2b), e é isso que fica registrado no histórico da compra.
  const [origem, setOrigem] = useState<PurchaseSource>("manual");
  // A nota que está NA TELA. Só recebe valor quando os itens são de fato
  // aplicados — senão a mensagem de topo descreveria uma leitura que a
  // pessoa ainda não aceitou.
  const [notaImportada, setNotaImportada] = useState<NotaConferencia | null>(
    null,
  );
  /** Leitura esperando a pessoa decidir se substitui o que já está na tela. */
  const [notaPendente, setNotaPendente] = useState<NotaConferencia | null>(
    null,
  );
  const [substituirOpen, setSubstituirOpen] = useState(false);
  // A soma das linhas não fechou com o total do documento (só a leitura por
  // IA sabe dizer isso). É o sinal mais barato de leitura incoerente.
  const [somaNaoFecha, setSomaNaoFecha] = useState(false);

  const scannerSupported = useClientFlag(isBarcodeCameraSupported);
  const queryRef = useRef<HTMLInputElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchSeq = useRef(0);
  const novoCustoId = useId();
  const novoPrecoId = useId();
  const novoQtdId = useId();
  const novoCodigoId = useId();

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  const total = items.reduce((soma, item) => soma + lineTotal(item), 0);
  const novos = items.filter((i) => i.isNew).length;
  const existentes = items.length - novos;

  function refocus() {
    setTimeout(() => queryRef.current?.focus(), 0);
  }

  function limparNovo() {
    setNovoNome(null);
    setNovoBarcode("");
    setNovoCustoDigits("");
    setNovoPrecoDigits("");
    setNovoQtd("1");
  }

  function adicionarExistente(product: Product) {
    setItems((prev) => [
      ...prev,
      {
        key: makeKey(),
        productId: product.id,
        isNew: false,
        name: product.name,
        barcode: "",
        quantity: "1",
        // Já vem com o último custo conhecido: normalmente é só conferir.
        costDigits: numberToDigits(product.cost_price),
        salePriceDigits: "",
        trackStock: product.track_stock,
        status: "reconhecido",
        descricaoNota: null,
      },
    ]);
    setQuery("");
    setSuggestions([]);
    setIsSearching(false);
    limparNovo();
    setErro(null);
    refocus();
  }

  function handleQueryChange(value: string) {
    setQuery(value);
    setErro(null);
    if (novoNome !== null) limparNovo();

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    const term = value.trim();
    if (term.length === 0) {
      setSuggestions([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const seq = ++fetchSeq.current;
    debounceTimer.current = setTimeout(async () => {
      const result = await searchProductsByName(term);
      if (seq === fetchSeq.current) {
        setSuggestions(result);
        setIsSearching(false);
      }
    }, 220);
  }

  async function submitTermo(rawTerm: string) {
    const term = rawTerm.trim();
    if (term.length === 0) return;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    fetchSeq.current++;
    setIsSearching(true);

    const product = await findProductByCode(term);
    setIsSearching(false);
    if (product) {
      adicionarExistente(product);
      return;
    }

    // Não achou: o item da nota vira um produto novo. Se o termo era um
    // código de barras, ele já entra preenchido no campo do código.
    const pareceCodigo = /^\d{8,14}$/.test(term);
    setQuery(term);
    setSuggestions([]);
    setNovoNome(pareceCodigo ? "" : term);
    setNovoBarcode(pareceCodigo ? term : "");
    setNovoCustoDigits("");
    setNovoPrecoDigits("");
    setNovoQtd("1");
    setErro(null);
  }

  function adicionarNovo() {
    const nome = (novoNome ?? "").trim();
    const qty = parseDecimalPtBR(novoQtd);
    const custo = digitsToNumber(novoCustoDigits);
    const preco = digitsToNumber(novoPrecoDigits);

    if (nome.length === 0) {
      setErro("Informe o nome do produto novo.");
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      setErro("Informe quantas unidades chegaram.");
      return;
    }
    if (novoCustoDigits.length === 0 || custo < 0) {
      setErro("Informe quanto você pagou por unidade.");
      return;
    }
    if (novoPrecoDigits.length === 0 || preco <= 0) {
      setErro("Informe por quanto você vai vender este produto.");
      return;
    }

    setItems((prev) => [
      ...prev,
      {
        key: makeKey(),
        productId: null,
        isNew: true,
        name: nome,
        barcode: novoBarcode.trim(),
        quantity: novoQtd,
        costDigits: novoCustoDigits,
        salePriceDigits: novoPrecoDigits,
        trackStock: true,
        status: "novo",
        descricaoNota: null,
      },
    ]);
    setQuery("");
    limparNovo();
    setErro(null);
    refocus();
  }

  /**
   * Traz para a tela o que foi extraído do arquivo (fase G2b). Tudo fica
   * editável: a importação preenche, a conferência é sempre humana.
   */
  function aplicarImportacao(nota: NotaConferencia) {
    if (nota.fornecedor) setSupplier(nota.fornecedor);
    if (nota.emitidaEm && nota.emitidaEm <= hoje()) setIssuedOn(nota.emitidaEm);
    if (nota.chaveAcesso) setAccessKey(nota.chaveAcesso);
    setOrigem(nota.origem);

    setItems(
      nota.itens.map((item) => ({
        key: makeKey(),
        productId: item.productId,
        isNew: item.status === "novo",
        // Item ligado mostra o nome do produto do Gaveta (é ele que vai ser
        // atualizado); a descrição da nota fica ao lado, para comparar.
        name: item.productName ?? item.descricao,
        barcode: item.barcode ?? "",
        quantity: quantidadeParaTexto(item.quantidade),
        costDigits: numberToDigits(item.custoUnitario),
        salePriceDigits: "",
        trackStock: item.trackStock,
        status: item.status,
        // Guarda sempre o que a nota dizia: some da tela enquanto o nome
        // estiver igual e reaparece assim que a pessoa editar, para ela
        // poder comparar com o original.
        descricaoNota: item.descricao,
      })),
    );
    setNotaImportada(nota);
    setQuery("");
    setSuggestions([]);
    limparNovo();
    setErro(null);
  }

  function receberImportacao(
    nota: NotaConferencia,
    avisoDeSoma?: boolean,
    jaConfirmado?: boolean,
  ) {
    setSomaNaoFecha(Boolean(avisoDeSoma));
    // Substituir o que a pessoa já digitou tem que ser escolha dela — MENOS
    // quando ela acabou de pedir a releitura do mesmo arquivo pela IA: ali a
    // troca é justamente o que ela pediu, e perguntar de novo seria ruído.
    if (items.length > 0 && !jaConfirmado) {
      setNotaPendente(nota);
      setSubstituirOpen(true);
      return;
    }
    aplicarImportacao(nota);
  }

  /** "Não é este produto": o item passa a ser cadastrado como novo. */
  function tratarComoNovo(key: string) {
    setItems((prev) =>
      prev.map((item) =>
        item.key === key
          ? {
              ...item,
              productId: null,
              isNew: true,
              status: "novo",
              name: item.descricaoNota ?? item.name,
              descricaoNota: null,
              trackStock: true,
            }
          : item,
      ),
    );
    setErro(null);
  }

  function atualizarItem(key: string, patch: Partial<NotaItem>) {
    setItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
    setErro(null);
  }

  function removerItem(key: string) {
    setItems((prev) => prev.filter((item) => item.key !== key));
    setErro(null);
  }

  function abrirConfirmacao() {
    if (items.length === 0) {
      setErro("Adicione ao menos um item à nota.");
      return;
    }
    for (const item of items) {
      const qty = parseDecimalPtBR(item.quantity);
      if (!Number.isFinite(qty) || qty <= 0) {
        setErro(`Confira a quantidade de "${item.name}".`);
        return;
      }
      if (item.name.trim().length === 0) {
        setErro("Um dos itens está sem nome. Confira a lista.");
        return;
      }
      if (item.costDigits.length === 0) {
        setErro(`Informe quanto custou "${item.name}".`);
        return;
      }
      if (item.isNew && digitsToNumber(item.salePriceDigits) <= 0) {
        setErro(`Informe o preço de venda de "${item.name}".`);
        return;
      }
    }
    setErro(null);
    setConfirmOpen(true);
  }

  function lancarNota() {
    startSaving(async () => {
      const resultado = await registrarCompra({
        supplierName: supplier,
        accessKey,
        issuedOn,
        source: origem,
        items: items.map((item) => ({
          productId: item.productId,
          isNew: item.isNew,
          description: item.name,
          barcode: item.barcode,
          quantity: parseDecimalPtBR(item.quantity),
          unitCost: digitsToNumber(item.costDigits),
          salePrice: item.isNew ? digitsToNumber(item.salePriceDigits) : null,
          trackStock: item.trackStock,
        })),
      });

      setConfirmOpen(false);
      if (!resultado.ok) {
        setErro(resultado.error);
        return;
      }
      router.push(`/estoque/compras/${resultado.purchaseId}?lancada=1`);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {erro ? <ErrorAlert message={erro} /> : null}

      {/* ---------- Importar de PDF/XML (G2b) ---------- */}
      <ImportarNota
        onImportar={receberImportacao}
        desabilitado={isSaving}
        iaLiberada={iaLiberada}
      />

      {somaNaoFecha ? (
        <div
          role="status"
          className="border-warning/40 bg-warning/10 minimal:max-sm:p-4 flex flex-col gap-2 rounded-xl border p-5"
        >
          <p className="text-warning flex items-center gap-2 text-base font-semibold">
            <AlertTriangle aria-hidden="true" className="size-5 shrink-0" />
            As contas da nota não fecharam
          </p>
          <p className="text-foreground minimal:max-sm:text-sm text-base">
            A soma dos itens lidos <strong>não bate</strong> com o total
            impresso na nota. Ou faltou algum item, ou algum valor saiu errado
            na leitura — <strong>confira linha por linha</strong> antes de
            lançar.
          </p>
        </div>
      ) : null}

      {notaImportada && items.length > 0 ? (
        notaImportada.origem === "foto" ? (
          // Leitura de imagem é a via mais fraca das três: o aviso precisa
          // ser explícito, senão a pessoa confia num resultado incompleto.
          <div
            role="status"
            className="border-warning/40 bg-warning/10 minimal:max-sm:p-4 flex flex-col gap-2 rounded-xl border p-5"
          >
            <p className="text-warning flex items-center gap-2 text-base font-semibold">
              <AlertTriangle aria-hidden="true" className="size-5 shrink-0" />
              Li a foto, mas só os nomes
            </p>
            <p className="text-foreground minimal:max-sm:text-sm text-base">
              Reconheci {items.length}{" "}
              {items.length === 1 ? "produto" : "produtos"}. Em foto de papel os{" "}
              <strong>números não saem confiáveis</strong>, então{" "}
              <strong>quantidade e custo ficaram em branco</strong> — preencha
              olhando a nota. Confira também os nomes: podem vir com letras
              trocadas.
            </p>
            <p className="text-muted-foreground text-sm">
              Sempre que tiver o{" "}
              <strong className="text-foreground">PDF</strong> ou o{" "}
              <strong className="text-foreground">XML</strong> da nota, prefira:
              nesses formatos o Gaveta lê nomes, quantidades e valores.
            </p>
          </div>
        ) : notaImportada.origem === "ia" ? (
          <p
            role="status"
            className="border-primary/30 bg-primary/5 minimal:max-sm:p-3.5 minimal:max-sm:text-sm rounded-xl border p-4 text-base"
          >
            A IA leu {items.length} {items.length === 1 ? "item" : "itens"}.{" "}
            <strong className="text-foreground font-medium">
              Confira item a item
            </strong>{" "}
            — ela acerta muito, mas quando erra, erra com cara de certo.
          </p>
        ) : (
          <p
            role="status"
            className="border-primary/30 bg-primary/5 minimal:max-sm:p-3.5 minimal:max-sm:text-sm rounded-xl border p-4 text-base"
          >
            Li {items.length} {items.length === 1 ? "item" : "itens"} do
            arquivo.
            <strong className="text-foreground font-medium">
              {" "}
              Confira item a item
            </strong>{" "}
            — principalmente os marcados como “parecido” — e ajuste o que
            precisar antes de lançar.
          </p>
        )
      ) : null}

      {/* ---------- Dados da nota ---------- */}
      <section
        aria-labelledby="nota-dados"
        className="ring-foreground/10 bg-card minimal:max-sm:p-4 flex flex-col gap-4 rounded-xl p-5 ring-1"
      >
        <h2
          id="nota-dados"
          className="minimal:max-sm:text-lg text-xl font-semibold"
        >
          Dados da nota
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="supplier" className="text-base">
              Fornecedor{" "}
              <span className="text-muted-foreground font-normal">
                (opcional)
              </span>
            </Label>
            <Input
              id="supplier"
              type="text"
              autoComplete="off"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="Ex.: Atacadão do Bairro"
              className="minimal:max-sm:h-11 minimal:max-sm:text-sm h-14 text-lg"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="issuedOn" className="text-base">
              Data da compra
            </Label>
            <Input
              id="issuedOn"
              type="date"
              value={issuedOn}
              max={hoje()}
              onChange={(e) => setIssuedOn(e.target.value)}
              className="minimal:max-sm:h-11 minimal:max-sm:text-sm h-14 text-lg"
            />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="accessKey" className="text-base">
            Chave da nota fiscal{" "}
            <span className="text-muted-foreground font-normal">
              (opcional)
            </span>
          </Label>
          <p id="accessKey-hint" className="text-muted-foreground text-sm">
            São os 44 números impressos na nota. Se você informar, o sistema
            avisa caso tente lançar a mesma nota de novo.
          </p>
          <Input
            id="accessKey"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={accessKey}
            onChange={(e) => setAccessKey(e.target.value)}
            aria-describedby="accessKey-hint"
            placeholder="Ex.: 3526 0812 3456 …"
            className="minimal:max-sm:h-11 minimal:max-sm:text-sm h-14 font-mono text-lg"
          />
        </div>
      </section>

      {/* ---------- Adicionar item ---------- */}
      <section
        aria-labelledby="nota-adicionar"
        className="ring-foreground/10 bg-card minimal:max-sm:p-4 flex flex-col gap-4 rounded-xl p-5 ring-1"
      >
        <h2
          id="nota-adicionar"
          className="minimal:max-sm:text-lg flex items-center gap-2 text-xl font-semibold"
        >
          <ScanBarcode aria-hidden="true" className="size-6" />
          Adicionar item da nota
        </h2>
        <div className="flex flex-col gap-2">
          <Label htmlFor="nota-query" className="text-base">
            Bipe o código de barras ou digite o nome do produto
          </Label>
          <Input
            ref={queryRef}
            id="nota-query"
            type="text"
            autoComplete="off"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submitTermo(query);
              }
            }}
            aria-describedby="nota-query-hint"
            placeholder="Ex.: 7891234567890 ou Arroz"
            className="minimal:max-sm:h-12 minimal:max-sm:text-base h-16 text-xl"
            disabled={isSaving}
          />
          <p id="nota-query-hint" className="text-muted-foreground text-sm">
            Se o produto ainda não existe no Gaveta, você poderá cadastrá-lo
            aqui mesmo.
          </p>
          {isSearching && novoNome === null ? (
            <p
              role="status"
              aria-live="polite"
              className="text-muted-foreground flex items-center text-sm"
            >
              <span aria-hidden="true" className={loaderStyles.dots}>
                Buscando produto<span>.</span>
                <span>.</span>
                <span>.</span>
              </span>
              <span className="sr-only">Buscando produto…</span>
            </p>
          ) : null}
        </div>

        {scannerSupported ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowScanner(true)}
            className="h-12 gap-2 self-start px-4 text-base"
          >
            <Camera aria-hidden="true" className="size-5" />
            Escanear com a câmera
          </Button>
        ) : null}

        {suggestions.length > 0 && novoNome === null ? (
          <ul
            role="listbox"
            aria-label="Sugestões de produtos"
            className="flex flex-col gap-1"
          >
            {suggestions.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => adicionarExistente(p)}
                  className="hover:bg-muted focus-visible:bg-muted flex w-full items-center justify-between gap-3 rounded-md px-3 py-3 text-left text-base outline-none"
                >
                  <span className="text-foreground font-medium">{p.name}</span>
                  <span className="text-muted-foreground text-sm">
                    {p.cost_price === null
                      ? "sem custo cadastrado"
                      : `custo atual ${formatBRL(p.cost_price)}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {novoNome !== null ? (
          <div className="border-border flex flex-col gap-3 rounded-lg border border-dashed p-4">
            <p className="flex items-center gap-2 text-base">
              <PackagePlus aria-hidden="true" className="size-5 shrink-0" />
              Produto ainda não cadastrado. Cadastre agora com os dados da nota:
            </p>
            <div className="flex flex-col gap-1">
              <Label htmlFor="novo-nome" className="text-sm">
                Nome do produto
              </Label>
              <Input
                id="novo-nome"
                type="text"
                autoComplete="off"
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                placeholder="Como está escrito na nota"
                className="h-12 text-base"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor={novoCodigoId} className="text-sm">
                  Código de barras (opcional)
                </Label>
                <Input
                  id={novoCodigoId}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={novoBarcode}
                  onChange={(e) => setNovoBarcode(e.target.value)}
                  className="h-12 font-mono text-base"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={novoQtdId} className="text-sm">
                  Quantidade que chegou
                </Label>
                <Input
                  id={novoQtdId}
                  type="text"
                  inputMode="decimal"
                  value={novoQtd}
                  onChange={(e) => setNovoQtd(e.target.value)}
                  className="h-12 text-base"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={novoCustoId} className="text-sm">
                  Custo por unidade
                </Label>
                <Input
                  id={novoCustoId}
                  type="text"
                  inputMode="numeric"
                  value={
                    novoCustoDigits === "" ? "" : digitsToBRL(novoCustoDigits)
                  }
                  onChange={(e) =>
                    setNovoCustoDigits(sanitizeDigits(e.target.value))
                  }
                  placeholder="R$ 0,00"
                  className="h-12 text-base"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={novoPrecoId} className="text-sm">
                  Preço de venda
                </Label>
                <Input
                  id={novoPrecoId}
                  type="text"
                  inputMode="numeric"
                  value={
                    novoPrecoDigits === "" ? "" : digitsToBRL(novoPrecoDigits)
                  }
                  onChange={(e) =>
                    setNovoPrecoDigits(sanitizeDigits(e.target.value))
                  }
                  placeholder="R$ 0,00"
                  className="h-12 text-base"
                />
              </div>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  limparNovo();
                  refocus();
                }}
                className="minimal:max-sm:h-10 minimal:max-sm:px-3 minimal:max-sm:text-sm h-12 px-5 text-base"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={adicionarNovo}
                className="minimal:max-sm:h-10 minimal:max-sm:px-3 minimal:max-sm:text-sm h-12 px-5 text-base"
              >
                Adicionar à nota
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      {/* ---------- Itens da nota ---------- */}
      <section
        aria-labelledby="nota-itens"
        className="ring-foreground/10 bg-card minimal:max-sm:p-4 flex flex-col gap-4 rounded-xl p-5 ring-1"
      >
        <h2
          id="nota-itens"
          className="minimal:max-sm:text-lg text-xl font-semibold"
        >
          Itens da nota{items.length > 0 ? ` (${items.length})` : ""}
        </h2>

        {items.length === 0 ? (
          <p className="text-muted-foreground text-base">
            Nenhum item ainda. Use o campo acima para ir somando os produtos da
            nota.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <li
                key={item.key}
                className="border-border flex flex-col gap-3 rounded-lg border p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-1 flex-col gap-1">
                    {item.isNew ? (
                      // Produto novo: o nome é o que vai para o cadastro, e
                      // a nota costuma trazê-lo abreviado ou cortado — então
                      // é campo, não texto fixo.
                      <div className="flex flex-col gap-1">
                        <Label htmlFor={`nome-${item.key}`} className="text-sm">
                          Nome do produto
                        </Label>
                        <Input
                          id={`nome-${item.key}`}
                          type="text"
                          autoComplete="off"
                          value={item.name}
                          onChange={(e) =>
                            atualizarItem(item.key, { name: e.target.value })
                          }
                          className="h-12 text-base font-semibold"
                        />
                      </div>
                    ) : (
                      <span className="minimal:max-sm:text-base text-foreground text-lg font-semibold">
                        {item.name}
                      </span>
                    )}
                    <StatusDoItem status={item.status} />
                    {item.descricaoNota && item.descricaoNota !== item.name ? (
                      <span className="text-muted-foreground text-sm">
                        Na nota está:{" "}
                        <span className="text-foreground">
                          {item.descricaoNota}
                        </span>
                      </span>
                    ) : null}
                    {item.status === "sugerido" ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => tratarComoNovo(item.key)}
                        className="mt-1 h-11 w-fit px-3 text-sm"
                      >
                        Não é este — cadastrar como novo
                      </Button>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => removerItem(item.key)}
                    aria-label={`Remover ${item.name || "item sem nome"} da nota`}
                    className="size-12 shrink-0 p-0"
                  >
                    <Trash2 aria-hidden="true" className="size-5" />
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`qtd-${item.key}`} className="text-sm">
                      Quantidade
                    </Label>
                    <Input
                      id={`qtd-${item.key}`}
                      type="text"
                      inputMode="decimal"
                      value={item.quantity}
                      onChange={(e) =>
                        atualizarItem(item.key, { quantity: e.target.value })
                      }
                      className="h-12 text-base"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`custo-${item.key}`} className="text-sm">
                      Custo por unidade
                    </Label>
                    <Input
                      id={`custo-${item.key}`}
                      type="text"
                      inputMode="numeric"
                      value={
                        item.costDigits === ""
                          ? ""
                          : digitsToBRL(item.costDigits)
                      }
                      onChange={(e) =>
                        atualizarItem(item.key, {
                          costDigits: sanitizeDigits(e.target.value),
                        })
                      }
                      placeholder="R$ 0,00"
                      className="h-12 text-base"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium">Total do item</span>
                    <span className="flex h-12 items-center text-lg font-semibold tabular-nums">
                      {formatBRL(lineTotal(item))}
                    </span>
                  </div>
                </div>

                {item.isNew ? (
                  <div className="flex flex-col gap-2">
                    {/* Editável na própria linha: o arquivo importado traz o
                        custo, mas nunca o preço de venda — e quem digitou à
                        mão pode querer corrigir sem refazer o item. */}
                    <div className="flex flex-col gap-1 sm:max-w-[16rem]">
                      <Label htmlFor={`venda-${item.key}`} className="text-sm">
                        Preço de venda
                      </Label>
                      <Input
                        id={`venda-${item.key}`}
                        type="text"
                        inputMode="numeric"
                        value={
                          item.salePriceDigits === ""
                            ? ""
                            : digitsToBRL(item.salePriceDigits)
                        }
                        onChange={(e) =>
                          atualizarItem(item.key, {
                            salePriceDigits: sanitizeDigits(e.target.value),
                          })
                        }
                        placeholder="R$ 0,00"
                        className="h-12 text-base"
                      />
                    </div>
                    <p className="text-muted-foreground text-sm">
                      Vai ser cadastrado
                      {item.barcode ? (
                        <>
                          {" "}
                          com o código{" "}
                          <span className="font-mono">{item.barcode}</span>
                        </>
                      ) : null}
                      , controlando estoque.
                    </p>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------- Total e confirmação ---------- */}
      <div className="ring-foreground/10 bg-card minimal:max-sm:p-4 flex flex-col gap-4 rounded-xl p-5 ring-1">
        <div className="flex items-center justify-between gap-3">
          <span className="minimal:max-sm:text-base text-lg font-medium">
            Total da nota
          </span>
          <span className="minimal:max-sm:text-xl text-2xl font-semibold tabular-nums">
            {formatBRL(total)}
          </span>
        </div>
        <p className="text-muted-foreground text-sm">
          Este valor também entra como gasto de{" "}
          <strong className="text-foreground font-medium">
            insumos / mercadorias
          </strong>{" "}
          no Financeiro, na data da compra.
        </p>
        <Button
          type="button"
          onClick={abrirConfirmacao}
          disabled={isSaving || items.length === 0}
          className="minimal:max-sm:h-12 minimal:max-sm:text-base h-14 text-lg font-semibold"
        >
          Conferir e lançar nota
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Conferir a nota antes de lançar"
        confirmLabel="Lançar nota"
        cancelLabel="Voltar e revisar"
        pending={isSaving}
        onConfirm={lancarNota}
        description={
          <span className="flex flex-col gap-2 text-base">
            <span>
              {existentes > 0
                ? `${existentes} ${existentes === 1 ? "produto será atualizado" : "produtos serão atualizados"}`
                : "Nenhum produto já cadastrado"}
              {novos > 0
                ? `, ${novos} ${novos === 1 ? "produto novo será criado" : "produtos novos serão criados"}`
                : ""}
              .
            </span>
            <span>
              O estoque entra na hora e o custo de cada produto passa a ser o
              desta nota.
            </span>
            <span>
              <strong className="font-semibold">{formatBRL(total)}</strong> será
              lançado como gasto em insumos / mercadorias.
            </span>
          </span>
        }
      />

      <ConfirmDialog
        open={substituirOpen}
        onClose={() => {
          setNotaPendente(null);
          setSubstituirOpen(false);
        }}
        title="Substituir os itens desta tela?"
        description={
          <>
            Você já tem {items.length} {items.length === 1 ? "item" : "itens"}{" "}
            na tela. Os itens do arquivo vão tomar o lugar deles.
          </>
        }
        confirmLabel="Usar os itens do arquivo"
        cancelLabel="Manter o que digitei"
        onConfirm={() => {
          if (notaPendente) aplicarImportacao(notaPendente);
          setNotaPendente(null);
          setSubstituirOpen(false);
        }}
      />

      {showScanner ? (
        <BarcodeScanner
          onDetect={(code) => {
            setShowScanner(false);
            void submitTermo(code);
          }}
          onClose={() => setShowScanner(false)}
        />
      ) : null}
    </div>
  );
}
