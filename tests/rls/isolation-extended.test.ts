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
