/**
 * Leitura de números das notas (fase G2b).
 *
 * Os dois formatos NÃO se misturam e NÃO se adivinham: o XML da NF-e usa
 * ponto decimal ("5.4990"), o texto impresso do DANFE usa o formato
 * brasileiro ("1.234,56"). "5.499" vale cinco e meio num e cinco mil e
 * quatrocentos noutro — por isso quem chama diz o formato, e o parser nunca
 * chuta (princípio do plano 08).
 */

export type FormatoNumero = "ponto" | "brasileiro";

/**
 * Converte um número no formato informado.
 * Devolve `null` quando não dá para ler com segurança.
 */
export function lerNumero(
  bruto: string | number | null | undefined,
  formato: FormatoNumero,
): number | null {
  if (typeof bruto === "number") {
    return Number.isFinite(bruto) ? bruto : null;
  }
  if (typeof bruto !== "string") return null;

  const texto = bruto.trim().replace(/\s/g, "");
  if (texto === "") return null;
  // Só dígitos, separadores e sinal — qualquer outra coisa não é número.
  if (!/^-?[\d.,]+$/.test(texto)) return null;

  let normalizado: string;
  if (formato === "brasileiro") {
    // Pontos são de milhar; a vírgula (quando houver) é o decimal.
    normalizado = texto.replace(/\./g, "").replace(",", ".");
  } else {
    // Ponto é o decimal. Vírgula não existe no layout da NF-e, mas se
    // aparecer num emissor desleixado, só vale quando não há ponto.
    normalizado = texto.includes(".")
      ? texto.replace(/,/g, "")
      : texto.replace(",", ".");
  }

  // Depois de normalizar só pode sobrar um separador decimal.
  if ((normalizado.match(/\./g) ?? []).length > 1) return null;

  const valor = Number(normalizado);
  return Number.isFinite(valor) ? valor : null;
}

/** Dinheiro da nota: duas casas, nunca negativo. */
export function lerDinheiro(
  bruto: string | number | null | undefined,
  formato: FormatoNumero,
): number | null {
  const valor = lerNumero(bruto, formato);
  if (valor === null || valor < 0) return null;
  return Math.round(valor * 100) / 100;
}

/** Quantidade da nota: até três casas (o mesmo do banco), sempre > 0. */
export function lerQuantidade(
  bruto: string | number | null | undefined,
  formato: FormatoNumero,
): number | null {
  const valor = lerNumero(bruto, formato);
  if (valor === null || valor <= 0) return null;
  return Math.round(valor * 1000) / 1000;
}

/**
 * Data de emissão da NF-e (`dhEmi` ISO com fuso, ou `dEmi` só data) para
 * YYYY-MM-DD. Usa a data local do documento, não a UTC: uma nota emitida às
 * 21h no Brasil não pode virar o dia seguinte.
 */
export function lerDataEmissao(
  bruto: string | null | undefined,
): string | null {
  if (typeof bruto !== "string") return null;
  const texto = bruto.trim();

  const soData = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto);
  if (soData) return `${soData[1]}-${soData[2]}-${soData[3]}`;

  // Formato brasileiro, como aparece impresso no DANFE.
  const brasileira = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto);
  if (brasileira) return `${brasileira[3]}-${brasileira[2]}-${brasileira[1]}`;

  return null;
}

/** Extrai 44 dígitos de uma chave que pode vir com espaços, pontos ou "NFe". */
export function lerChaveAcesso(
  bruto: string | null | undefined,
): string | null {
  if (typeof bruto !== "string") return null;
  const digitos = bruto.replace(/\D/g, "");
  return /^\d{44}$/.test(digitos) ? digitos : null;
}
