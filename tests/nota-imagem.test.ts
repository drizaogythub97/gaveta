// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  escalaSegura,
  ImagemInvalida,
  limiarDeOtsu,
  MAXIMO_PIXELS_SAIDA,
  paraBmp,
  prepararParaOcr,
} from "@/lib/compras/imagem";
import { imagemPareceIntegra } from "@/lib/compras/ocr-imagem";

/**
 * Preparo da imagem antes do OCR (plano 08, fase G2c). São as contas que
 * decidem se o Tesseract vai conseguir ler alguma coisa — e os limites que
 * impedem uma imagem enorme de derrubar o servidor.
 */

/** Imagem sintética: metade escura, metade clara. */
function meioAMeio(largura: number, altura: number, canais = 3): Uint8Array {
  const px = new Uint8Array(largura * altura * canais);
  for (let i = 0; i < largura * altura; i++) {
    const valor = i % largura < largura / 2 ? 40 : 210;
    for (let c = 0; c < canais; c++) px[i * canais + c] = valor;
  }
  return px;
}

describe("limiarDeOtsu", () => {
  it("acha o corte entre tinta e papel sem número mágico", () => {
    const cinza = new Uint8Array(1000);
    cinza.fill(30, 0, 500);
    cinza.fill(220, 500);
    const limiar = limiarDeOtsu(cinza);
    // O que importa não é o número exato, e sim que ele SEPARE os dois
    // grupos: escuro vira tinta, claro vira papel.
    expect(30 > limiar).toBe(false);
    expect(220 > limiar).toBe(true);
  });
});

describe("escalaSegura", () => {
  it("amplia imagem pequena até perto do alvo de leitura", () => {
    expect(escalaSegura(1000, 1400)).toBeGreaterThan(1.5);
  });

  it("não amplia imagem que já é grande", () => {
    expect(escalaSegura(3000, 4000)).toBe(1);
  });

  it("nunca estoura o teto de pixels da saída", () => {
    for (const [l, a] of [
      [1045, 1564],
      [1600, 2200],
      [800, 600],
    ] as const) {
      const escala = escalaSegura(l, a);
      expect(l * escala * a * escala).toBeLessThanOrEqual(MAXIMO_PIXELS_SAIDA);
    }
  });
});

describe("prepararParaOcr", () => {
  it("devolve imagem binarizada (só preto e branco)", () => {
    const pronta = prepararParaOcr(meioAMeio(200, 100), 200, 100, 3);
    const valores = new Set(pronta.dados);
    expect([...valores].sort()).toEqual([0, 255]);
  });

  it("amplia a imagem pequena", () => {
    const pronta = prepararParaOcr(meioAMeio(200, 100), 200, 100, 3);
    expect(pronta.largura).toBeGreaterThan(200);
  });

  it("aceita imagem em tons de cinza (1 canal)", () => {
    const pronta = prepararParaOcr(meioAMeio(200, 100, 1), 200, 100, 1);
    expect(pronta.dados.length).toBe(pronta.largura * pronta.altura);
  });

  it("recusa dimensão inválida e imagem incompleta", () => {
    expect(() => prepararParaOcr(new Uint8Array(10), 0, 10, 3)).toThrow(
      ImagemInvalida,
    );
    // Diz ser 100x100 mas os dados não chegam nem perto: bomba de expansão.
    expect(() => prepararParaOcr(new Uint8Array(10), 100, 100, 3)).toThrow(
      ImagemInvalida,
    );
  });

  it("recusa imagem acima do teto de pixels", () => {
    expect(() => prepararParaOcr(new Uint8Array(8), 10_000, 10_000, 3)).toThrow(
      ImagemInvalida,
    );
  });
});

describe("paraBmp", () => {
  it("monta um BMP de 24 bits com as dimensões certas", () => {
    const bmp = paraBmp({
      dados: new Uint8Array([0, 255, 255, 0]),
      largura: 2,
      altura: 2,
    });
    const visao = new DataView(bmp.buffer);
    expect(bmp[0]).toBe(0x42); // 'B'
    expect(bmp[1]).toBe(0x4d); // 'M'
    expect(visao.getInt32(18, true)).toBe(2); // largura
    expect(visao.getInt32(22, true)).toBe(2); // altura
    expect(visao.getUint16(28, true)).toBe(24); // bits por pixel
    expect(bmp.length).toBe(visao.getUint32(2, true));
  });

  it("alinha cada linha em múltiplo de 4 bytes, como manda o formato", () => {
    // 3 pixels = 9 bytes por linha → 3 de sobra para fechar em 12.
    const bmp = paraBmp({
      dados: new Uint8Array(9),
      largura: 3,
      altura: 3,
    });
    expect(bmp.length).toBe(54 + 12 * 3);
  });
});

describe("imagemPareceIntegra", () => {
  /** PNG mínimo válido: assinatura de 8 bytes + bloco IHDR, com corpo. */
  function pngValido(): Uint8Array {
    const b = new Uint8Array(2048);
    b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    b.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
    return b;
  }

  it("aceita PNG com assinatura completa e bloco IHDR", () => {
    expect(imagemPareceIntegra(pngValido())).toBe(true);
  });

  it("recusa arquivo que só copiou o começo da assinatura", () => {
    // Era este caso que fazia o servidor subir o OCR à toa para depois
    // descobrir que a imagem não abre.
    const truncado = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a]);
    expect(imagemPareceIntegra(truncado)).toBe(false);
  });

  it("recusa PNG com assinatura certa mas sem IHDR", () => {
    const semIhdr = pngValido();
    semIhdr.set([0, 0, 0, 0], 12);
    expect(imagemPareceIntegra(semIhdr)).toBe(false);
  });

  it("aceita JPEG que começa em SOI e termina em EOI", () => {
    const jpeg = new Uint8Array(2048);
    jpeg.set([0xff, 0xd8, 0xff], 0);
    jpeg.set([0xff, 0xd9], jpeg.length - 2);
    expect(imagemPareceIntegra(jpeg)).toBe(true);
  });

  it("recusa JPEG cortado no meio (sem o fim)", () => {
    const cortado = new Uint8Array(2048);
    cortado.set([0xff, 0xd8, 0xff], 0);
    expect(imagemPareceIntegra(cortado)).toBe(false);
  });

  it("recusa arquivo pequeno demais para ser foto de nota", () => {
    const minusculo = new Uint8Array(64);
    minusculo.set([0xff, 0xd8, 0xff], 0);
    expect(imagemPareceIntegra(minusculo)).toBe(false);
  });
});
