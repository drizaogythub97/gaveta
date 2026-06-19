import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  adminClient,
  createTestUser,
  deleteTestUser,
  userClient,
  type TestUser,
} from "./helpers";

let alice: TestUser;
let bob: TestUser;

beforeAll(async () => {
  const admin = adminClient();
  const { error } = await admin.from("products").select("id").limit(1);
  if (error) {
    throw new Error(
      `Tabela public.products inacessivel — confirme que o SQL de ` +
        `supabase/migrations/0001_init.sql foi aplicado: ${error.message}`,
    );
  }

  alice = await createTestUser("alice");
  bob = await createTestUser("bob");
}, 30_000);

afterAll(async () => {
  if (alice) await deleteTestUser({ id: alice.id });
  if (bob) await deleteTestUser({ id: bob.id });
});

describe("RLS — profiles", () => {
  it("cada usuario ve apenas o proprio profile", async () => {
    const aliceView = userClient(alice.accessToken);
    const bobView = userClient(bob.accessToken);

    const { data: aliceRows, error: aliceError } = await aliceView
      .from("profiles")
      .select("id");
    expect(aliceError).toBeNull();
    expect(aliceRows).toHaveLength(1);
    expect(aliceRows?.[0]?.id).toBe(alice.id);

    const { data: bobRows, error: bobError } = await bobView
      .from("profiles")
      .select("id");
    expect(bobError).toBeNull();
    expect(bobRows).toHaveLength(1);
    expect(bobRows?.[0]?.id).toBe(bob.id);
  });
});

describe("RLS — products", () => {
  it("Bob nao enxerga produtos de Alice e nao consegue deleta-los", async () => {
    const aliceApp = userClient(alice.accessToken);
    const bobApp = userClient(bob.accessToken);

    const { data: inserted, error: insertError } = await aliceApp
      .from("products")
      .insert({
        user_id: alice.id,
        name: "Cafe da Alice",
        price: 12.5,
        track_stock: true,
        stock_quantity: 10,
      })
      .select("id")
      .single();
    expect(insertError).toBeNull();
    const aliceProductId = inserted!.id as string;

    const { data: bobSees, error: bobSelectError } = await bobApp
      .from("products")
      .select("id");
    expect(bobSelectError).toBeNull();
    expect(bobSees).toHaveLength(0);

    const { error: bobDeleteError } = await bobApp
      .from("products")
      .delete()
      .eq("id", aliceProductId);
    expect(bobDeleteError).toBeNull();

    const admin = adminClient();
    const { data: stillThere } = await admin
      .from("products")
      .select("id")
      .eq("id", aliceProductId)
      .single();
    expect(stillThere?.id).toBe(aliceProductId);
  });

  it("Bob nao consegue inserir produto se forjar user_id de Alice", async () => {
    const bobApp = userClient(bob.accessToken);

    const { error } = await bobApp.from("products").insert({
      user_id: alice.id,
      name: "Tentativa do Bob",
      price: 1,
      track_stock: false,
    });
    expect(error).not.toBeNull();
  });

  it("Bob nao consegue editar produto de Alice", async () => {
    const admin = adminClient();
    const { data: aliceProduct } = await admin
      .from("products")
      .select("id, name")
      .eq("user_id", alice.id)
      .limit(1)
      .single();
    expect(aliceProduct?.id).toBeTruthy();

    const bobApp = userClient(bob.accessToken);
    const { error: updateError, data: updateData } = await bobApp
      .from("products")
      .update({ name: "Renomeado pelo Bob" })
      .eq("id", aliceProduct!.id)
      .select("id");
    expect(updateError).toBeNull();
    expect(updateData).toHaveLength(0);

    const { data: untouched } = await admin
      .from("products")
      .select("name")
      .eq("id", aliceProduct!.id)
      .single();
    expect(untouched?.name).toBe(aliceProduct!.name);
  });
});

describe("RLS — sales via register_sale", () => {
  it("venda da Alice nao aparece para Bob", async () => {
    const aliceApp = userClient(alice.accessToken);
    const bobApp = userClient(bob.accessToken);

    const { data: saleId, error: rpcError } = await aliceApp.rpc(
      "register_sale",
      {
        items: [
          { product_id: null, name: "Item avulso", unit_price: 5, quantity: 2 },
        ],
      },
    );
    expect(rpcError).toBeNull();
    expect(saleId).toBeTruthy();

    const { data: bobSales } = await bobApp.from("sales").select("id");
    expect(bobSales).toHaveLength(0);

    const { data: bobItems } = await bobApp.from("sale_items").select("id");
    expect(bobItems).toHaveLength(0);

    const { data: aliceSales } = await aliceApp.from("sales").select("id");
    expect(aliceSales?.length).toBeGreaterThanOrEqual(1);
  });
});
