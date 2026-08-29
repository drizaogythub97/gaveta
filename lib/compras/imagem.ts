/**
 * Preparo da imagem antes do OCR (plano 08, fase G2c).
 *
 * O Tesseract trabalha bem por volta de 300 DPI e com preto no branco. Uma
 * digitalização de celular costuma chegar bem abaixo disso e com o papel
 * acinzentado, então aqui a imagem vira tons de cinza, tem o contraste
 * esticado, é ampliada até um alvo razoável e só então binarizada por Otsu.
 *
 * Tudo em JavaScript puro, sem dependência nativa: é pouco código e mantém a
 * função pequena no servidor.
 */

/**
 * Teto de pixels da imagem RECEBIDA. Uma imagem de poucos megabytes pode se
 * expandir para centenas ao descomprimir — este é o limite que impede isso
 * de virar consumo de memória do servidor.
 */
export const MAXIMO_PIXELS_ENTRADA = 40_000_000;

/**
 * Teto de pixels DEPOIS de redimensionar.
 *
 * Acima disso o worker do Tesseract morre com
 * `RangeError: Too many properties to enumerate` — ele monta a árvore de
 * blocos/linhas/palavras/símbolos da página e o objeto fica grande demais
 * para atravessar o canal do worker. Medido numa digitalização real de
 * folha A4: **2000×2993 (6,0 Mpx) falha; 1400×2095 (2,9 Mpx) lê**. Como o
 * estopim é a quantidade de símbolos, e não o pixel em si, o limite é
 * folgado de propósito.
 */
export const MAXIMO_PIXELS_SAIDA = 3_000_000;

/** Largura que buscamos para o OCR ler bem uma folha A4. */
const LARGURA_ALVO = 2000;

export class ImagemInvalida extends Error {}

export type ImagemCinza = {
  dados: Uint8Array;
  largura: number;
  altura: number;
};

/** Converte para tons de cinza e estica o contraste para a faixa toda. */
function paraCinza(
  pixels: Uint8Array | Uint8ClampedArray,
  largura: number,
  altura: number,
  canais: number,
): Uint8Array {
  const cinza = new Uint8Array(largura * altura);
  let min = 255;
  let max = 0;

  for (let i = 0; i < cinza.length; i++) {
    const p = i * canais;
    // Pesos padrão de luminância (o olho enxerga mais o verde).
    const v =
      canais >= 3
        ? (pixels[p]! * 299 + pixels[p + 1]! * 587 + pixels[p + 2]! * 114) /
          1000
        : pixels[p]!;
    const c = v | 0;
    cinza[i] = c;
    if (c < min) min = c;
    if (c > max) max = c;
  }

  const amplitude = Math.max(max - min, 1);
  for (let i = 0; i < cinza.length; i++) {
    cinza[i] = Math.min(
      255,
      Math.max(0, ((cinza[i]! - min) * 255) / amplitude),
    );
  }
  return cinza;
}

/**
 * Limiar de Otsu: acha sozinho o corte que melhor separa tinta de papel,
 * maximizando a variância entre os dois grupos. Sem número mágico.
 */
export function limiarDeOtsu(cinza: Uint8Array): number {
  const histograma = new Array(256).fill(0);
  for (const v of cinza) histograma[v]++;

  const total = cinza.length;
  let soma = 0;
  for (let i = 0; i < 256; i++) soma += i * histograma[i];

  let somaFundo = 0;
  let pesoFundo = 0;
  let melhor = -1;
  let limiar = 128;

  for (let i = 0; i < 256; i++) {
    pesoFundo += histograma[i];
    if (pesoFundo === 0) continue;
    const pesoFrente = total - pesoFundo;
    if (pesoFrente === 0) break;

    somaFundo += i * histograma[i];
    const mediaFundo = somaFundo / pesoFundo;
    const mediaFrente = (soma - somaFundo) / pesoFrente;
    const entre = pesoFundo * pesoFrente * (mediaFundo - mediaFrente) ** 2;

    if (entre > melhor) {
      melhor = entre;
      limiar = i;
    }
  }
  return limiar;
}

/**
 * Reamostragem bilinear. Amplia letra pequena sem serrilhar e, quando a
 * imagem passa do teto, REDUZ — uma foto de celular de página inteira chega
 * com muito mais pixel do que o OCR aguenta.
 */
function redimensionar(
  cinza: Uint8Array,
  largura: number,
  altura: number,
  escala: number,
): ImagemCinza {
  if (escala === 1) return { dados: cinza, largura, altura };

  const nova = Math.round(largura * escala);
  const novaAltura = Math.round(altura * escala);
  const saida = new Uint8Array(nova * novaAltura);

  for (let y = 0; y < novaAltura; y++) {
    const sy = Math.min(altura - 1, y / escala);
    const y0 = Math.floor(sy);
    const y1 = Math.min(altura - 1, y0 + 1);
    const fy = sy - y0;

    for (let x = 0; x < nova; x++) {
      const sx = Math.min(largura - 1, x / escala);
      const x0 = Math.floor(sx);
      const x1 = Math.min(largura - 1, x0 + 1);
      const fx = sx - x0;

      const a = cinza[y0 * largura + x0]!;
      const b = cinza[y0 * largura + x1]!;
      const c = cinza[y1 * largura + x0]!;
      const d = cinza[y1 * largura + x1]!;

      saida[y * nova + x] =
        a * (1 - fx) * (1 - fy) +
        b * fx * (1 - fy) +
        c * (1 - fx) * fy +
        d * fx * fy;
    }
  }
  return { dados: saida, largura: nova, altura: novaAltura };
}

/**
 * Fator de redimensionamento para o OCR ler bem sem estourar o worker.
 *
 * Três casos, nesta ordem:
 *   • imagem grande demais → ENCOLHE até caber no teto (era o buraco: uma
 *     foto de celular de página inteira ia inteira para o OCR e o derrubava);
 *   • imagem pequena → amplia até perto da largura alvo, respeitando o teto;
 *   • imagem já em bom tamanho → não mexe.
 */
export function escalaSegura(largura: number, altura: number): number {
  if (largura <= 0 || altura <= 0) return 1;

  const teto = Math.sqrt(MAXIMO_PIXELS_SAIDA / (largura * altura));
  if (teto < 1) return teto;

  const desejada = LARGURA_ALVO / largura;
  return Math.max(1, Math.min(desejada, teto));
}

/**
 * Deixa a imagem no ponto para o OCR: cinza, contraste esticado, ampliada e
 * binarizada — nessa ordem. Lança `ImagemInvalida` quando as dimensões não
 * fecham com os dados recebidos ou passam do teto.
 */
export function prepararParaOcr(
  pixels: Uint8Array | Uint8ClampedArray,
  largura: number,
  altura: number,
  canais: number,
): ImagemCinza {
  if (largura <= 0 || altura <= 0 || canais <= 0) {
    throw new ImagemInvalida("Dimensões inválidas");
  }
  if (largura * altura > MAXIMO_PIXELS_ENTRADA) {
    throw new ImagemInvalida("Imagem grande demais");
  }
  if (pixels.length < largura * altura * canais) {
    throw new ImagemInvalida("Imagem incompleta");
  }

  const cinza = paraCinza(pixels, largura, altura, canais);

  // Amplia ANTES de binarizar: ampliar uma imagem já em preto e branco
  // interpola os dois extremos e devolve cinza nas bordas das letras. Na
  // ordem certa, a saída é binária de verdade e a borda fica mais limpa.
  const ampliada = redimensionar(
    cinza,
    largura,
    altura,
    escalaSegura(largura, altura),
  );

  const limiar = limiarDeOtsu(ampliada.dados);
  for (let i = 0; i < ampliada.dados.length; i++) {
    ampliada.dados[i] = ampliada.dados[i]! > limiar ? 255 : 0;
  }

  return ampliada;
}

/**
 * Empacota a imagem em BMP de 24 bits — formato simples que o tesseract.js
 * decodifica sem depender de nada nativo. As linhas vão de baixo para cima e
 * cada uma é alinhada em múltiplo de 4 bytes, como manda o formato.
 */
export function paraBmp(imagem: ImagemCinza): Uint8Array {
  const { dados, largura, altura } = imagem;
  const bytesPorLinha = largura * 3;
  const sobra = (4 - (bytesPorLinha % 4)) % 4;
  const tamanhoPixels = (bytesPorLinha + sobra) * altura;

  const buffer = new Uint8Array(54 + tamanhoPixels);
  const visao = new DataView(buffer.buffer);

  buffer[0] = 0x42; // 'B'
  buffer[1] = 0x4d; // 'M'
  visao.setUint32(2, 54 + tamanhoPixels, true);
  visao.setUint32(10, 54, true); // início dos pixels
  visao.setUint32(14, 40, true); // tamanho do cabeçalho de informação
  visao.setInt32(18, largura, true);
  visao.setInt32(22, altura, true); // positivo = de baixo para cima
  visao.setUint16(26, 1, true); // planos
  visao.setUint16(28, 24, true); // bits por pixel
  visao.setUint32(34, tamanhoPixels, true);

  for (let y = 0; y < altura; y++) {
    const origem = (altura - 1 - y) * largura;
    let destino = 54 + y * (bytesPorLinha + sobra);
    for (let x = 0; x < largura; x++) {
      const v = dados[origem + x]!;
      buffer[destino++] = v; // B
      buffer[destino++] = v; // G
      buffer[destino++] = v; // R
    }
  }
  return buffer;
}
