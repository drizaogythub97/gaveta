import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestUser, deleteTestUser, userClient } from "./helpers";
import type { TestUser } from "./helpers";

/**
 * Fechamento dia a dia (RPCs `fechamento_por_dia` e
 * `fechamento_vendas_do_dia`, migration 0018).
 *
 * O que estes testes trancam, nesta ordem de importância:
 *   1. a soma dos dias é EXATAMENTE o total do período já mostrado no topo
 *      da aba — se divergir, a tela passa a contar duas histórias;
 *   2. o detalhe de um dia bate com a linha daquele dia;
 *   3. o isolamento por usuário continua valendo (a RLS é a fronteira).
 *
 * **Dois usuários para o arquivo inteiro, criados uma vez.** Cada
 * `createTestUser` é um cadastro + login no Supabase Auth, que tem limite de
 * taxa por IP; a suíte inteira já anda perto dele, então um usuário por
 * asserção derrubaria os outros arquivos.
 */

const DE = new Date(Date.now() - 3_600_000).toISOString();
const ATE = new Date(Date.now() + 3_600_000).toISOString();

// O mesmo fuso que a aplicação usa para as bordas do período. Nos testes é
// o do processo, exatamente como em `periodTimeZone()`.
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

type DiaRow = {
  dia: string;
  recebido: number;
  taxas: number;
  custo: number;
  base: number;
  base_coberta: number;
  vendas: number;
  recebido_fiado: number;
};

type ItemRow = {
  sale_id: string;
  origem: string;
  taxa: number;
  valor: number;
  custo: number | null;
};

const centavos = (n: number) => Math.round(n * 100) / 100;

let dono: TestUser;
let intruso: TestUser;
let app: ReturnType<typeof userClient>;
let appIntruso: ReturnType<typeof userClient>;

async function dias(cliente = app): Promise<DiaRow[]> {
  const { data, error } = await cliente.rpc("fechamento_por_dia", {
    p_from: DE,
    p_to: ATE,
    p_tz: TZ,
  });
  expect(error).toBeNull();
  return (data ?? []) as DiaRow[];
}

async function itensDoDia(dia: string, cliente = app): Promise<ItemRow[]> {
  const { data, error } = await cliente.rpc("fechamento_vendas_do_dia", {
    p_dia: dia,
    p_from: DE,
    p_to: ATE,
    p_tz: TZ,
  });
  expect(error).toBeNull();
  return (data ?? []) as ItemRow[];
}

async function criarProduto(
  nome: string,
  preco: number,
  custo: number | null,
): Promise<string> {
  const { data, error } = await app
    .from("products")
    .insert({
      user_id: dono.id,
      name: nome,
      price: preco,
      cost_price: custo,
      track_stock: true,
      stock_quantity: 100,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Falha ao criar produto: ${error.message}`);
  return (data as { id: string }).id;
}

/**
 * Cenário do arquivo, montado uma vez:
 *   • venda 1 — 2 arroz a 10 (custo 4 cada), em dinheiro → 20, custo 8;
 *   • venda 2 — 1 feijão a 20 (custo 7) + 1 bolo a 30 (SEM custo), no
 *     crédito com taxa de 2 → 50, custo 7, e 30 sem cobertura.
 * Totais esperados: recebido 70, taxas 2, custo 15, base 70, coberta 40.
 */
beforeAll(async () => {
  dono = await createTestUser("dia-dono");
  intruso = await createTestUser("dia-intruso");
  app = userClient(dono.accessToken);
  appIntruso = userClient(intruso.accessToken);

  const arroz = await criarProduto("Arroz", 10, 4);
  const feijao = await criarProduto("Feijão", 20, 7);
  const bolo = await criarProduto("Bolo", 30, null);

  const venda1 = await app.rpc("register_sale", {
    items: [{ product_id: arroz, name: "Arroz", unit_price: 10, quantity: 2 }],
    payment_method: "dinheiro",
  });
  expect(venda1.error).toBeNull();

  const venda2 = await app.rpc("register_sale", {
    items: [
      { product_id: feijao, name: "Feijão", unit_price: 20, quantity: 1 },
      { product_id: bolo, name: "Bolo", unit_price: 30, quantity: 1 },
    ],
    payment_method: "credito_avista",
    fee_amount: 2,
  });
  expect(venda2.error).toBeNull();
}, 60_000);

afterAll(async () => {
  await deleteTestUser(dono);
  await deleteTestUser(intruso);
});

describe("RPC fechamento_por_dia", () => {
  it("soma exatamente o mesmo que o total do período", async () => {
    const { data: resumo } = await app
      .rpc("lucro_custo_summary", { p_from: DE, p_to: ATE, p_methods: null })
      .maybeSingle();
    const r = resumo as Record<string, number>;

    const linhas = await dias();
    const soma = (campo: keyof DiaRow) =>
      centavos(linhas.reduce((s, l) => s + Number(l[campo]), 0));

    expect(soma("recebido")).toBe(
      centavos(Number(r.recebido_vista) + Number(r.recebido_fiado)),
    );
    expect(soma("taxas")).toBe(centavos(Number(r.taxas)));
    expect(soma("custo")).toBe(
      centavos(Number(r.custo_vista) + Number(r.custo_fiado)),
    );
    expect(soma("base")).toBe(
      centavos(Number(r.base_vista) + Number(r.base_fiado)),
    );
    expect(soma("vendas")).toBe(2);
  });

  it("tira a taxa do lucro e deixa o custo de recompra intacto", async () => {
    const linhas = await dias();
    const soma = (campo: keyof DiaRow) =>
      centavos(linhas.reduce((s, l) => s + Number(l[campo]), 0));

    expect(soma("recebido")).toBe(70);
    expect(soma("taxas")).toBe(2);
    expect(soma("custo")).toBe(15); // 2×4 + 7 — o bolo não entra
    // lucro = recebido − taxas − custo (a conta que a tela mostra)
    expect(centavos(soma("recebido") - soma("taxas") - soma("custo"))).toBe(53);
  });

  it("não conta item sem custo como zero: derruba a cobertura", async () => {
    const linhas = await dias();
    const soma = (campo: keyof DiaRow) =>
      centavos(linhas.reduce((s, l) => s + Number(l[campo]), 0));

    // O bolo (R$ 30) entra no que foi vendido, mas não no que está coberto.
    expect(soma("base")).toBe(70);
    expect(soma("base_coberta")).toBe(40);
  });

  it("não enxerga o movimento de outro usuário", async () => {
    expect(await dias(appIntruso)).toHaveLength(0);
  });
});

describe("mais de um dia no período", () => {
  it("quebra o período em dias e mantém cada venda no seu", async () => {
    // Venda com data no passado: `register_sale` sempre grava "agora", então
    // aqui o insert é direto (a RLS continua valendo — é a própria conta).
    const ontem = new Date(Date.now() - 26 * 3_600_000).toISOString();
    const { data: venda, error } = await app
      .from("sales")
      .insert({
        user_id: dono.id,
        total: 100,
        status: "completed",
        payment_method: "dinheiro",
        created_at: ontem,
      })
      .select("id")
      .single();
    expect(error).toBeNull();

    const { error: erroItem } = await app.from("sale_items").insert({
      sale_id: (venda as { id: string }).id,
      user_id: dono.id,
      name_snapshot: "Venda de ontem",
      unit_price: 100,
      quantity: 1,
      line_total: 100,
      unit_cost: 40,
    });
    expect(erroItem).toBeNull();

    // A janela do arquivo é de 1 hora; esta consulta precisa de uma maior.
    const desde = new Date(Date.now() - 48 * 3_600_000).toISOString();
    const { data, error: erroRpc } = await app.rpc("fechamento_por_dia", {
      p_from: desde,
      p_to: ATE,
      p_tz: TZ,
    });
    expect(erroRpc).toBeNull();
    const linhas = (data ?? []) as DiaRow[];

    // Dois dias distintos, o mais recente primeiro.
    expect(linhas.length).toBe(2);
    expect(linhas[0].dia > linhas[1].dia).toBe(true);
    // E cada venda ficou no seu dia, sem se misturar.
    expect(Number(linhas[0].recebido)).toBe(70);
    expect(Number(linhas[1].recebido)).toBe(100);
    expect(Number(linhas[1].custo)).toBe(40);

    // O detalhe do dia de ontem traz só a venda de ontem — com a MESMA
    // janela do resumo, senão o dia da borda mostraria o que o resumo não
    // contou.
    const { data: detalhe } = await app.rpc("fechamento_vendas_do_dia", {
      p_dia: linhas[1].dia,
      p_from: desde,
      p_to: ATE,
      p_tz: TZ,
    });
    const itens = (detalhe ?? []) as ItemRow[];
    expect(itens).toHaveLength(1);
    expect(Number(itens[0].valor)).toBe(100);
  });
});

describe("RPC fechamento_vendas_do_dia", () => {
  it("detalha o dia batendo com a linha do resumo", async () => {
    const linhas = await dias();
    const [linha] = linhas;
    const itens = await itensDoDia(linha.dia);

    // 3 itens em 2 vendas.
    expect(itens).toHaveLength(3);
    expect(new Set(itens.map((i) => i.sale_id)).size).toBe(2);
    expect(centavos(itens.reduce((s, i) => s + Number(i.valor), 0))).toBe(
      Number(linha.recebido),
    );
    expect(centavos(itens.reduce((s, i) => s + Number(i.custo ?? 0), 0))).toBe(
      Number(linha.custo),
    );
    expect(itens.every((i) => i.origem === "caixa")).toBe(true);
  });

  it("devolve custo NULO no item sem custo, em vez de zero", async () => {
    const [linha] = await dias();
    const itens = await itensDoDia(linha.dia);
    const semCusto = itens.filter((i) => i.custo === null);
    expect(semCusto).toHaveLength(1);
    expect(Number(semCusto[0].valor)).toBe(30);
  });

  it("não devolve o dia de outro usuário", async () => {
    const [linha] = await dias();
    expect(await itensDoDia(linha.dia, appIntruso)).toHaveLength(0);
  });
});
