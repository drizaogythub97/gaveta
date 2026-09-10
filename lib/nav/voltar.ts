/**
 * Para onde a tela devolve a pessoa depois de salvar.
 *
 * Nasceu do Fechamento: o aviso "faltam produtos sem custo" oferece um botão
 * que leva ao cadastro do produto, e salvar jogava a pessoa na lista de
 * Produtos — longe do relatório que ela estava conferindo, e sem nenhuma
 * confirmação de que a conta tinha fechado.
 *
 * O destino vem da URL, então é entrada de usuário: sem validação, viraria
 * um redirecionamento aberto (`?voltar=https://site-falso`) — o clássico de
 * usar o endereço confiável do sistema como trampolim para outro lugar. Por
 * isso a regra é ALVO CONHECIDO, não "parece seguro": só passa o que começa
 * com um dos caminhos internos previstos.
 */

/** Telas que podem receber alguém de volta depois de salvar. */
const DESTINOS_PERMITIDOS = ["/financeiro", "/estoque", "/produtos"] as const;

export function caminhoDeVoltaSeguro(
  valor: string | string[] | undefined,
): string | null {
  const bruto = Array.isArray(valor) ? valor[0] : valor;
  if (typeof bruto !== "string" || bruto === "") return null;

  // "//host" e "/\host" são endereços de OUTRO site que começam com barra —
  // o navegador os trata como absolutos. Ficam de fora antes de qualquer
  // comparação com a lista.
  if (bruto.startsWith("//") || bruto.startsWith("/\\")) return null;
  if (!bruto.startsWith("/")) return null;
  // Nada de quebra de linha (cabeçalho forjado) nem de âncora.
  if (/[\r\n\t]/.test(bruto)) return null;

  const caminho = bruto.split("?")[0].split("#")[0];
  const permitido = DESTINOS_PERMITIDOS.some(
    (destino) => caminho === destino || caminho.startsWith(`${destino}/`),
  );
  return permitido ? bruto : null;
}
