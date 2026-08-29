import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { STATE_FUNCIONAL } from "../../playwright.config";

import { loadUsers, userClient, type TestUser } from "./helpers";

/**
 * Leitura de nota por IA de visão (plano 08, fase G2d).
 *
 * Dois testes com propósitos bem diferentes:
 *
 * 1. **Fechado por padrão** — roda SEMPRE. Garante que uma conta fora da
 *    lista não vê nada da via de IA. A fronteira de verdade é a server
 *    action (`iaLiberadaPara`), coberta em `tests/nota-ia-visao.test.ts`.
 *
 * 2. **Leitura de verdade** — roda só quando `IA_E2E_LIBERADA=1`, porque
 *    exige que o servidor tenha sido iniciado com o id do usuário
 *    descartável em `IA_VISAO_LIBERADA_PARA` (o id só existe depois que o
 *    `setup` cria a conta). A sequência está no `docs/09`.
 */

test.use({ storageState: STATE_FUNCIONAL });
test.describe.configure({ mode: "serial" });

let user: TestUser;
let app: SupabaseClient;

const sel = { itens: 'section[aria-labelledby="nota-itens"]' };

test.beforeAll(() => {
  user = loadUsers().funcional;
  app = userClient(user.accessToken);
});

/**
 * Uma "foto" de nota, desenhada e fotografada pelo próprio navegador.
 *
 * ATENÇÃO: isto SUBSTITUI o conteúdo da página. Chame ANTES de navegar para
 * o Gaveta — passar `await fotoDeUmaNota(page)` como argumento de um
 * `setInputFiles` apaga a tela que se ia usar.
 */
async function fotografarNota(page: import("@playwright/test").Page) {
  await page.setContent(`
    <body style="margin:0;background:#fff;font-family:Arial,Helvetica,sans-serif">
      <div style="padding:24px;color:#000">
        <div style="font-size:20px;font-weight:bold">MERCADO TESTE LTDA</div>
        <div style="font-size:16px;margin-top:6px">DADOS DOS PRODUTOS</div>
        <table style="margin-top:12px;font-size:18px;border-collapse:collapse">
          <tr><th style="text-align:left;padding:4px 18px 4px 0">DESCRICAO</th>
              <th style="padding:4px 18px 4px 0">QTD</th>
              <th style="padding:4px 18px 4px 0">V.UNIT</th>
              <th style="padding:4px 0">V.TOTAL</th></tr>
          <tr><td style="padding:4px 18px 4px 0">ARROZ BRANCO 5KG</td>
              <td style="padding:4px 18px 4px 0">2</td>
              <td style="padding:4px 18px 4px 0">25,00</td>
              <td style="padding:4px 0">50,00</td></tr>
          <tr><td style="padding:4px 18px 4px 0">FEIJAO CARIOCA 1KG</td>
              <td style="padding:4px 18px 4px 0">3</td>
              <td style="padding:4px 18px 4px 0">10,00</td>
              <td style="padding:4px 0">30,00</td></tr>
        </table>
        <div style="font-size:18px;margin-top:14px">VALOR TOTAL DA NOTA 80,00</div>
      </div>
    </body>`);
  return page.screenshot({ clip: { x: 0, y: 0, width: 620, height: 260 } });
}

test("1. conta fora da lista não vê a leitura por IA", async ({ page }) => {
  test.skip(
    process.env.IA_E2E_LIBERADA === "1",
    "Este teste vale para a conta NÃO liberada.",
  );
  // A leitura local (OCR) roda antes e, em partida fria, ainda baixa o
  // modelo de idioma.
  test.setTimeout(180_000);

  // A foto primeiro: desenhá-la substitui o conteúdo da página.
  const foto = await fotografarNota(page);

  await page.goto("/estoque/compras/nova");
  await page.locator("#nota-arquivo").setInputFiles({
    name: "nota.png",
    mimeType: "image/png",
    buffer: foto,
  });

  // Espera a leitura local TERMINAR, tendo dado certo ou não: o que este
  // teste verifica é a ausência da via de IA, não a qualidade do OCR.
  await expect(
    page.getByRole("button", { name: "Escolher arquivo da nota" }),
  ).toBeEnabled({ timeout: 150_000 });

  // Nada da via de IA aparece para esta conta.
  await expect(page.getByRole("button", { name: "Ler com IA" })).toHaveCount(0);
  await expect(page.getByText("o arquivo sai do Gaveta")).toHaveCount(0);

  // Este teste cobre o que a PESSOA vê. A fronteira de verdade é a server
  // action, que chama `iaLiberadaPara` antes de qualquer coisa — e essa
  // função está coberta em `tests/nota-ia-visao.test.ts`, incluindo o caso
  // de lista vazia (padrão fechado) e o de chave ausente.
});

test("2. a IA lê a foto com nomes E valores", async ({ page }) => {
  test.skip(
    process.env.IA_E2E_LIBERADA !== "1",
    "Precisa do servidor iniciado com a conta de teste em IA_VISAO_LIBERADA_PARA (ver docs/09).",
  );
  // A chamada ao modelo é lenta e passa por rede externa.
  test.setTimeout(180_000);

  // A foto primeiro: desenhá-la substitui o conteúdo da página.
  const foto = await fotografarNota(page);

  await page.goto("/estoque/compras/nova");
  await page.locator("#nota-arquivo").setInputFiles({
    name: "nota.png",
    mimeType: "image/png",
    buffer: foto,
  });
  await expect(page.getByText("Li a foto, mas só os nomes")).toBeVisible({
    timeout: 150_000,
  });

  // A IA é uma porta separada: nunca dispara sozinha, e avisa antes.
  await page.getByRole("button", { name: "Ler com IA" }).click();
  const dialogo = page.getByRole("dialog");
  await expect(dialogo).toContainText(
    "envia o arquivo para um serviço de fora",
  );
  await dialogo.getByRole("button", { name: "Enviar e ler" }).click();

  await expect(page.getByText(/A IA leu \d+ iten?s?/)).toBeVisible({
    timeout: 150_000,
  });

  // Diferente do OCR, aqui os VALORES vêm preenchidos.
  const linhas = page.locator(`${sel.itens} li`);
  await expect(linhas).toHaveCount(2);
  const arroz = linhas.filter({ hasText: "Produto novo" }).first();
  await expect(arroz.getByLabel("Custo por unidade")).not.toHaveValue("");

  // A soma fecha com o total impresso, então não há aviso de incoerência.
  await expect(page.getByText("As contas da nota não fecharam")).toHaveCount(0);

  // Nada foi gravado: a conferência continua obrigatória.
  const { count } = await app
    .from("purchases")
    .select("id", { count: "exact", head: true })
    .eq("source", "ia");
  expect(count ?? 0).toBe(0);
});
