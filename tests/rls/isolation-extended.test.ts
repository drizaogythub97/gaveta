import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  adminClient,
  createTestUser,
  deleteTestUser,
  userClient,
  type TestUser,
} from "./helpers";

/**
 * Testes de acesso cruzado (RLS) para as tabelas/recursos adicionados após a
 * migration inicial: product_barcodes (0003), preferences_fees (0004),
 * update de profiles, e o bucket de storage brand-logos (0005).
 *
 * Padrões observados (iguais aos de isolation.test.ts):
 * - SELECT cruzado: 0 linhas, sem erro (USING filtra).
 * - INSERT com user_id forjado: erro (violação do WITH CHECK).
 * - UPDATE/DELETE cruzado: sem erro, 0 linhas afetadas (USING filtra a linha).
 */

let alice: TestUser;
let bob: TestUser;
const uploadedPaths: string[] = [];

beforeAll(async () => {
  alice = await createTestUser("alice-ext");
  bob = await createTestUser("bob-ext");
}, 30_000);

afterAll(async () => {
  const admin = adminClient();
  if (uploadedPaths.length > 0) {
    await admin.storage.from("brand-logos").remove(uploadedPaths);
  }
  if (alice) await deleteTestUser({ id: alice.id });
  if (bob) await deleteTestUser({ id: bob.id });
});

describe("RLS — profiles (escrita cruzada)", () => {
  it("Bob nao consegue editar o profile de Alice", async () => {
    const bobApp = userClient(bob.accessToken);

    const { error, data } = await bobApp
      .from("profiles")
      .update({ theme: "dark", brand_name: "Marca do Bob" })
      .eq("id", alice.id)
      .select("id");
    expect(error).toBeNull();
    expect(data).toHaveLength(0);

    const admin = adminClient();
    const { data: aliceProfile } = await admin
      .from("profiles")
      .select("theme, brand_name")
      .eq("id", alice.id)
      .single();
    expect(aliceProfile?.theme).not.toBe("dark");
    expect(aliceProfile?.brand_name ?? null).not.toBe("Marca do Bob");
  });
});

describe("RLS — product_barcodes", () => {
  let aliceProductId: string;
  let aliceBarcodeId: string;

  it("prepara: Alice cria um produto e um codigo de barras", async () => {
    const aliceApp = userClient(alice.accessToken);

    const { data: product, error: pErr } = await aliceApp
      .from("products")
      .insert({
        user_id: alice.id,
        name: "Produto com codigo",
        price: 9.9,
        track_stock: false,
      })
      .select("id")
      .single();
    expect(pErr).toBeNull();
    aliceProductId = product!.id as string;

    const { data: barcode, error: bErr } = await aliceApp
      .from("product_barcodes")
      .insert({
        user_id: alice.id,
        product_id: aliceProductId,
        barcode: `789-${Date.now()}`,
      })
      .select("id")
      .single();
    expect(bErr).toBeNull();
    aliceBarcodeId = barcode!.id as string;
  });

  it("Bob nao enxerga os codigos de barras de Alice", async () => {
    const bobApp = userClient(bob.accessToken);
    const { data, error } = await bobApp
      .from("product_barcodes")
      .select("id");
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("Bob nao consegue inserir codigo forjando o user_id de Alice", async () => {
    const bobApp = userClient(bob.accessToken);
    const { error } = await bobApp.from("product_barcodes").insert({
      user_id: alice.id,
      product_id: aliceProductId,
      barcode: `forjado-${Date.now()}`,
    });
    expect(error).not.toBeNull();
  });

  it("Bob nao consegue editar nem deletar o codigo de Alice", async () => {
    const bobApp = userClient(bob.accessToken);

    const { error: upErr, data: upData } = await bobApp
      .from("product_barcodes")
      .update({ barcode: "alterado-pelo-bob" })
      .eq("id", aliceBarcodeId)
      .select("id");
    expect(upErr).toBeNull();
    expect(upData).toHaveLength(0);

    const { error: delErr } = await bobApp
      .from("product_barcodes")
      .delete()
      .eq("id", aliceBarcodeId);
    expect(delErr).toBeNull();

    const admin = adminClient();
    const { data: still } = await admin
      .from("product_barcodes")
      .select("id")
      .eq("id", aliceBarcodeId)
      .single();
    expect(still?.id).toBe(aliceBarcodeId);
  });
});

describe("RLS — preferences_fees", () => {
  it("prepara: Alice cria suas taxas; Bob nao as enxerga", async () => {
    const aliceApp = userClient(alice.accessToken);
    const { error } = await aliceApp.from("preferences_fees").insert({
      user_id: alice.id,
      pix_pct: 1.5,
    });
    expect(error).toBeNull();

    const bobApp = userClient(bob.accessToken);
    const { data, error: selErr } = await bobApp
      .from("preferences_fees")
      .select("user_id");
    expect(selErr).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("Bob nao consegue inserir taxas forjando o user_id de Alice", async () => {
    const bobApp = userClient(bob.accessToken);
    const { error } = await bobApp.from("preferences_fees").insert({
      user_id: alice.id,
      pix_pct: 99,
    });
    expect(error).not.toBeNull();
  });

  it("Bob nao consegue editar as taxas de Alice", async () => {
    const bobApp = userClient(bob.accessToken);
    const { error, data } = await bobApp
      .from("preferences_fees")
      .update({ pix_pct: 50 })
      .eq("user_id", alice.id)
      .select("user_id");
    expect(error).toBeNull();
    expect(data).toHaveLength(0);

    const admin = adminClient();
    const { data: aliceFees } = await admin
      .from("preferences_fees")
      .select("pix_pct")
      .eq("user_id", alice.id)
      .single();
    expect(Number(aliceFees?.pix_pct)).toBe(1.5);
  });
});

describe("RLS — storage brand-logos (escrita por pasta = user_id)", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

  it("Bob NAO consegue enviar arquivo para a pasta de Alice", async () => {
    const bobApp = userClient(bob.accessToken);
    const path = `${alice.id}/logo-${Date.now()}.png`;
    const { error } = await bobApp.storage
      .from("brand-logos")
      .upload(path, png, { contentType: "image/png", upsert: false });
    expect(error).not.toBeNull();
  });

  it("Bob consegue enviar para a propria pasta", async () => {
    const bobApp = userClient(bob.accessToken);
    const path = `${bob.id}/logo-${Date.now()}.png`;
    const { error } = await bobApp.storage
      .from("brand-logos")
      .upload(path, png, { contentType: "image/png", upsert: false });
    expect(error).toBeNull();
    uploadedPaths.push(path);
  });

  it("Bob nao consegue deletar arquivo da pasta de Alice", async () => {
    // Alice envia um arquivo proprio.
    const aliceApp = userClient(alice.accessToken);
    const alicePath = `${alice.id}/logo-${Date.now()}.png`;
    const { error: upErr } = await aliceApp.storage
      .from("brand-logos")
      .upload(alicePath, png, { contentType: "image/png", upsert: false });
    expect(upErr).toBeNull();
    uploadedPaths.push(alicePath);

    // Bob tenta remover — RLS de delete deve impedir (objeto permanece).
    const bobApp = userClient(bob.accessToken);
    await bobApp.storage.from("brand-logos").remove([alicePath]);

    const admin = adminClient();
    const { data: list } = await admin.storage
      .from("brand-logos")
      .list(alice.id);
    const names = (list ?? []).map((o) => o.name);
    expect(names).toContain(alicePath.split("/")[1]);
  });
});

// =====================================================================
// Fase D — estoque/caixa v2: stock_movements, estorno transacional,
// desconto e ajuste de estoque.
// =====================================================================
describe("RLS + funcional — stock_movements e RPCs da Fase D", () => {
  let trackedProductId: string;
  let saleId: string;

  it("prepara: Alice cria produto com estoque e registra venda com desconto", async () => {
    const aliceApp = userClient(alice.accessToken);

    const { data: product, error: pErr } = await aliceApp
      .from("products")
      .insert({
        user_id: alice.id,
        name: "Produto com estoque (Fase D)",
        price: 10,
        track_stock: true,
        stock_quantity: 20,
      })
      .select("id")
      .single();
    expect(pErr).toBeNull();
    trackedProductId = product!.id as string;

    // Venda: 3 unidades a 10 = subtotal 30, desconto 5 => total 25.
    const { data: newSale, error: rpcErr } = await aliceApp.rpc(
      "register_sale",
      {
        items: [
          {
            product_id: trackedProductId,
            name: "Produto com estoque (Fase D)",
            unit_price: 10,
            quantity: 3,
          },
        ],
        discount_amount: 5,
      },
    );
    expect(rpcErr).toBeNull();
    saleId = newSale as string;

    const admin = adminClient();
    const { data: sale } = await admin
      .from("sales")
      .select("total, discount_amount")
      .eq("id", saleId)
      .single();
    expect(Number(sale?.total)).toBe(25);
    expect(Number(sale?.discount_amount)).toBe(5);

    // Estoque baixou de 20 para 17.
    const { data: prod } = await admin
      .from("products")
      .select("stock_quantity")
      .eq("id", trackedProductId)
      .single();
    expect(Number(prod?.stock_quantity)).toBe(17);

    // Movimento de venda registrado (saída de 3).
    const { data: moves } = await admin
      .from("stock_movements")
      .select("type, quantity")
      .eq("sale_id", saleId);
    expect(moves).toHaveLength(1);
    expect(moves![0].type).toBe("sale");
    expect(Number(moves![0].quantity)).toBe(-3);
  });

  it("desconto maior que o subtotal e rejeitado", async () => {
    const aliceApp = userClient(alice.accessToken);
    const { error } = await aliceApp.rpc("register_sale", {
      items: [
        { product_id: null, name: "Avulso", unit_price: 5, quantity: 1 },
      ],
      discount_amount: 999,
    });
    expect(error).not.toBeNull();
  });

  it("estorno devolve o estoque e registra movimento; reativar baixa de novo", async () => {
    const aliceApp = userClient(alice.accessToken);
    const admin = adminClient();

    // Estorna.
    const { error: voidErr } = await aliceApp.rpc("set_sale_status", {
      p_sale_id: saleId,
      p_status: "voided",
    });
    expect(voidErr).toBeNull();

    let { data: prod } = await admin
      .from("products")
      .select("stock_quantity")
      .eq("id", trackedProductId)
      .single();
    expect(Number(prod?.stock_quantity)).toBe(20); // 17 + 3 devolvidos

    // Reativa.
    const { error: backErr } = await aliceApp.rpc("set_sale_status", {
      p_sale_id: saleId,
      p_status: "completed",
    });
    expect(backErr).toBeNull();

    ({ data: prod } = await admin
      .from("products")
      .select("stock_quantity")
      .eq("id", trackedProductId)
      .single());
    expect(Number(prod?.stock_quantity)).toBe(17); // baixou de novo

    const { data: moves } = await admin
      .from("stock_movements")
      .select("type")
      .eq("sale_id", saleId)
      .order("created_at", { ascending: true });
    expect(moves?.map((m) => m.type)).toEqual(["sale", "void", "sale"]);
  });

  it("adjust_stock registra reposicao e atualiza o estoque", async () => {
    const aliceApp = userClient(alice.accessToken);
    const admin = adminClient();

    const { error } = await aliceApp.rpc("adjust_stock", {
      p_product_id: trackedProductId,
      p_mode: "add",
      p_quantity: 8,
    });
    expect(error).toBeNull();

    const { data: prod } = await admin
      .from("products")
      .select("stock_quantity")
      .eq("id", trackedProductId)
      .single();
    expect(Number(prod?.stock_quantity)).toBe(25); // 17 + 8

    const { data: moves } = await admin
      .from("stock_movements")
      .select("quantity")
      .eq("product_id", trackedProductId)
      .eq("type", "restock");
    expect(moves).toHaveLength(1);
    expect(Number(moves![0].quantity)).toBe(8);
  });

  it("Bob nao enxerga as movimentacoes de Alice", async () => {
    const bobApp = userClient(bob.accessToken);
    const { data, error } = await bobApp
      .from("stock_movements")
      .select("id");
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("Bob nao consegue inserir movimentacao forjando o user_id de Alice", async () => {
    const bobApp = userClient(bob.accessToken);
    const { error } = await bobApp.from("stock_movements").insert({
      user_id: alice.id,
      product_id: trackedProductId,
      type: "adjust",
      quantity: 1,
    });
    expect(error).not.toBeNull();
  });
});

// =====================================================================
// Fase E — fechamento de caixa: cash_sessions, cash_movements, vínculo de
// vendas em dinheiro e conferência esperado × contado.
// =====================================================================
describe("RLS + funcional — sessão de caixa (Fase E)", () => {
  let sessionId: string;

  it("Alice abre caixa; abrir de novo falha (uma sessão aberta por vez)", async () => {
    const aliceApp = userClient(alice.accessToken);

    const { data: id, error } = await aliceApp.rpc("open_cash_session", {
      p_opening: 100,
      p_note: "turno teste",
    });
    expect(error).toBeNull();
    sessionId = id as string;

    const { error: dupErr } = await aliceApp.rpc("open_cash_session", {
      p_opening: 0,
    });
    expect(dupErr).not.toBeNull();
  });

  it("venda em dinheiro vincula à sessão; pix não vincula", async () => {
    const aliceApp = userClient(alice.accessToken);
    const admin = adminClient();

    const { data: cashSale } = await aliceApp.rpc("register_sale", {
      items: [
        { product_id: null, name: "Avulso dinheiro", unit_price: 30, quantity: 1 },
      ],
      payment_method: "dinheiro",
    });
    const { data: pixSale } = await aliceApp.rpc("register_sale", {
      items: [
        { product_id: null, name: "Avulso pix", unit_price: 40, quantity: 1 },
      ],
      payment_method: "pix",
    });

    const { data: cashRow } = await admin
      .from("sales")
      .select("cash_session_id")
      .eq("id", cashSale as string)
      .single();
    const { data: pixRow } = await admin
      .from("sales")
      .select("cash_session_id")
      .eq("id", pixSale as string)
      .single();
    expect(cashRow?.cash_session_id).toBe(sessionId);
    expect(pixRow?.cash_session_id).toBeNull();
  });

  it("sangria e suprimento exigem caixa aberto e ficam isolados de Bob", async () => {
    const aliceApp = userClient(alice.accessToken);
    const bobApp = userClient(bob.accessToken);

    const { error: suprErr } = await aliceApp.rpc("add_cash_movement", {
      p_type: "suprimento",
      p_amount: 50,
    });
    expect(suprErr).toBeNull();
    const { error: sangErr } = await aliceApp.rpc("add_cash_movement", {
      p_type: "sangria",
      p_amount: 20,
      p_note: "troco para o cofre",
    });
    expect(sangErr).toBeNull();

    const { data: bobSessions } = await bobApp.from("cash_sessions").select("id");
    expect(bobSessions).toHaveLength(0);
    const { data: bobMoves } = await bobApp.from("cash_movements").select("id");
    expect(bobMoves).toHaveLength(0);

    // Bob não tem caixa aberto → movimento falha.
    const { error: bobErr } = await bobApp.rpc("add_cash_movement", {
      p_type: "sangria",
      p_amount: 10,
    });
    expect(bobErr).not.toBeNull();
  });

  it("fechamento calcula esperado = troco + vendas dinheiro + suprimentos − sangrias", async () => {
    const aliceApp = userClient(alice.accessToken);
    const admin = adminClient();

    // Esperado = 100 + 30 + 50 − 20 = 160. Contado 158 → falta 2.
    const { error } = await aliceApp.rpc("close_cash_session", {
      p_counted: 158,
    });
    expect(error).toBeNull();

    const { data: closed } = await admin
      .from("cash_sessions")
      .select("status, expected_amount, counted_amount, difference_amount")
      .eq("id", sessionId)
      .single();
    expect(closed?.status).toBe("closed");
    expect(Number(closed?.expected_amount)).toBe(160);
    expect(Number(closed?.counted_amount)).toBe(158);
    expect(Number(closed?.difference_amount)).toBe(-2);
  });

  it("Bob nao consegue forjar uma sessão com o user_id de Alice", async () => {
    const bobApp = userClient(bob.accessToken);
    const { error } = await bobApp.from("cash_sessions").insert({
      user_id: alice.id,
      opening_amount: 0,
    });
    expect(error).not.toBeNull();
  });
});
