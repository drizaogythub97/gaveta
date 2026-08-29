/**
 * Extração de nota (plano 08, fase G2b). O parser de XML e o de PDF-texto
 * produzem EXATAMENTE esta mesma forma — quem consome (o motor de
 * correspondência e a tela de conferência) não sabe de onde veio.
 *
 * Princípio do plano: nunca "chutar" valor. O que o parser não reconhece
 * com confiança fica nulo e o usuário completa na conferência.
 */

/**
 * De onde a nota foi lida. Bate com `PurchaseSource`, que é o que fica
 * gravado no histórico da compra — dá para saber depois se aquela nota veio
 * do XML (exata) ou de uma foto (só os nomes).
 */
export type OrigemExtracao = "xml" | "pdf" | "foto";

export type ItemExtraido = {
  /** Descrição do produto como está na nota. */
  descricao: string;
  /** GTIN/EAN quando a nota traz (o XML tem campo próprio). */
  barcode: string | null;
  quantidade: number;
  /**
   * Nulo quando a leitura não conseguiu o valor com confiança — é o caso do
   * OCR de imagem (G2c), que lê nomes bem e números mal. A tela mostra o
   * campo vazio para a pessoa preencher, em vez de exibir R$ 0,00 e deixar
   * passar um custo errado.
   */
  custoUnitario: number | null;
  /** Total da linha conforme a nota — só para conferência. */
  totalLinha: number | null;
};

export type NotaExtraida = {
  origem: OrigemExtracao;
  fornecedor: string | null;
  /** Chave de acesso da NF-e: 44 dígitos. */
  chaveAcesso: string | null;
  /** Data de emissão em YYYY-MM-DD. */
  emitidaEm: string | null;
  /** Total da nota conforme o documento (não é a soma que vai ao banco). */
  total: number | null;
  itens: ItemExtraido[];
};

/**
 * Como cada item da nota se ligou ao catálogo do Gaveta:
 * - `reconhecido`: o código de barras da nota bate com um produto cadastrado;
 * - `sugerido`: não veio código (ou não bateu), mas o nome é muito parecido
 *   com um produto existente — o usuário confirma;
 * - `novo`: não existe no Gaveta e será cadastrado com os dados da nota.
 */
export type StatusItem = "reconhecido" | "sugerido" | "novo";

export type ItemConferencia = ItemExtraido & {
  status: StatusItem;
  /** Produto do Gaveta ligado a este item (null quando é novo). */
  productId: string | null;
  /** Nome do produto no Gaveta — pode diferir da descrição da nota. */
  productName: string | null;
  /** O produto ligado controla estoque? */
  trackStock: boolean;
};

export type NotaConferencia = Omit<NotaExtraida, "itens"> & {
  itens: ItemConferencia[];
};

/** Limite de tamanho do arquivo enviado (nota fiscal é sempre pequena). */
export const TAMANHO_MAXIMO_ARQUIVO = 8 * 1024 * 1024;

/** Teto de itens aceitos de um arquivo (o mesmo do schema da nota). */
export const MAXIMO_ITENS_EXTRAIDOS = 200;
