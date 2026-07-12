"use server";

import { z } from "zod";

import { carregarComprovante } from "@/lib/receipt/data";
import type { ComprovanteCarregado } from "@/lib/receipt/data";

export type ResultadoComprovante =
  | (ComprovanteCarregado & {
      ok: true;
      titulo: string;
      /** Nome do arquivo SEM extensão (o emissor põe .png/.pdf). */
      nomeArquivo: string;
    })
  | { ok: false; error: string };

const saleIdSchema = z.string().uuid();

const ERRO_GENERICO =
  "Não foi possível gerar o comprovante. Tente de novo em instantes.";

/**
 * Dados do comprovante para emissão direta no aparelho (celular): o cliente
 * renderiza o papel fora da tela e gera PDF/PNG + compartilhamento nativo,
 * sem abrir a rota /comprovante/[saleId]. Mesmo loader da rota de preview.
 */
export async function dadosComprovante(
  saleId: string,
): Promise<ResultadoComprovante> {
  const parsed = saleIdSchema.safeParse(saleId);
  if (!parsed.success) {
    return { ok: false, error: ERRO_GENERICO };
  }

  const result = await carregarComprovante(parsed.data);
  if (!result.ok) {
    return {
      ok: false,
      error:
        result.motivo === "auth"
          ? "Sessão expirada. Entre de novo."
          : ERRO_GENERICO,
    };
  }

  const { data, prefs, brand } = result.comprovante;
  const nome = (prefs.showName && brand.name) || "Gaveta";
  return {
    ok: true,
    data,
    prefs,
    brand,
    titulo: `Comprovante ${nome}`,
    nomeArquivo: `comprovante-${data.id.slice(0, 8)}`,
  };
}
