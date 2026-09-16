import { test } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  userClient,
  type TestUser,
} from "../../tests/rls/helpers";
import { loginPelaUI, dispensarAvisos } from "../../tests/e2e/helpers";

const NOMES = [
  "Arroz tipo 1 5kg",
  "Arroz integral 1kg",
  "Arroz parboilizado",
  "Coca-Cola 2L",
  "Coca-Cola lata 350ml",
  "Coca-Cola zero 600ml",
  "Refrigerante guaraná 2L",
  "Feijão carioca 1kg",
  "Feijão preto 1kg",
  "Macarrão espaguete",
  "Macarrão parafuso",
  "Óleo de soja 900ml",
  "Açúcar cristal 1kg",
  "Café torrado 500g",
  "Leite integral 1L",
  "Leite condensado",
  "Creme de leite",
  "Farinha de trigo 1kg",
  "Farinha de mandioca",
  "Sal refinado 1kg",
  "Biscoito recheado chocolate",
  "Biscoito água e sal",
  "Sabão em pó 1kg",
  "Detergente neutro",
  "Amaciante 2L",
  "Papel higiênico 12 rolos",
  "Pão de forma",
  "Margarina 500g",
  "Molho de tomate",
  "Milho verde lata",
];

function stats(v: number[]) {
  const s = [...v].sort((a, b) => a - b);
  return {
    n: v.length,
    min: s[0],
    mediana: s[Math.floor(s.length / 2)],
    max: s[s.length - 1],
    todos: v,
  };
}

test("mede a producao", async ({ page }) => {
  const user: TestUser = await createTestUser("perf");
  const resultado: Record<string, unknown> = {};
  try {
    const app = userClient(user.accessToken);
    const { error } = await app
      .from("products")
      .insert(
        NOMES.map((name, i) => ({
          user_id: user.id,
          name,
          price: 5 + i,
          track_stock: true,
          stock_quantity: 10,
        })),
      );
    if (error) throw new Error(error.message);

    const t0 = Date.now();
    await loginPelaUI(page, user);
    resultado["login_ate_dashboard_ms"] = Date.now() - t0;
    await dispensarAvisos(page);

    // 1) Carga completa (reload) de cada tela — TTFB e fim do carregamento.
    const rotas = [
      "/dashboard",
      "/caixa",
      "/produtos",
      "/estoque",
      "/financeiro",
    ];
    const cargas: Record<string, { ttfb: number[]; load: number[] }> = {};
    for (let rodada = 0; rodada < 3; rodada++) {
      for (const rota of rotas) {
        await page.goto(rota, { waitUntil: "load" });
        const nav = await page.evaluate(() => {
          const n = performance.getEntriesByType(
            "navigation",
          )[0] as PerformanceNavigationTiming;
          return {
            ttfb: Math.round(n.responseStart - n.requestStart),
            load: Math.round(n.loadEventEnd - n.startTime),
          };
        });
        cargas[rota] ??= { ttfb: [], load: [] };
        cargas[rota].ttfb.push(nav.ttfb);
        cargas[rota].load.push(nav.load);
      }
    }
    resultado["carga_completa"] = Object.fromEntries(
      Object.entries(cargas).map(([r, v]) => [
        r,
        { ttfb: stats(v.ttfb), load: stats(v.load) },
      ]),
    );

    // 2) Navegação interna (clique no link) entre telas.
    const navs: Record<string, number[]> = {};
    const sequencia: [string, string][] = [
      ["/caixa", "Frente de caixa"],
      ["/produtos", "Produtos"],
      ["/estoque", "Estoque"],
      ["/financeiro", "Financeiro"],
      ["/dashboard", "Olá"],
      ["/caixa", "Frente de caixa"],
      ["/produtos", "Produtos"],
      ["/dashboard", "Olá"],
    ];
    for (const [rota, titulo] of sequencia) {
      const t = Date.now();
      await page.locator(`header a[href="${rota}"]`).first().click();
      await page
        .getByRole("heading", { level: 1 })
        .filter({ hasText: titulo })
        .waitFor();
      (navs[rota] ??= []).push(Date.now() - t);
    }
    resultado["navegacao_interna_ms"] = navs;

    // 3) A busca do caixa: tempo do POST (Server Action) e tempo até a lista aparecer.
    await page.goto("/caixa", { waitUntil: "load" });
    const campo = page.locator("#pos-query");
    const termos = [
      "co",
      "coca",
      "ar",
      "arroz",
      "fe",
      "leite",
      "bis",
      "co",
      "ar",
      "mac",
    ];
    const posts: number[] = [];
    const ateLista: number[] = [];
    const servidor: string[] = [];
    for (const termo of termos) {
      await campo.fill("");
      await page.waitForTimeout(400);
      const esperaPost = page.waitForResponse(
        (r) =>
          r.request().method() === "POST" &&
          new URL(r.url()).pathname === "/caixa",
      );
      await campo.pressSequentially(termo, { delay: 60 });
      const tUltimaTecla = Date.now();
      const resp = await esperaPost;
      const timing = resp.request().timing();
      posts.push(Math.round(timing.responseEnd));
      servidor.push(resp.headers()["x-vercel-id"] ?? "");
      await page
        .getByRole("listbox", { name: "Sugestões de produtos" })
        .locator("li")
        .first()
        .waitFor();
      ateLista.push(Date.now() - tUltimaTecla);
    }
    resultado["busca_caixa"] = {
      post_ms: stats(posts),
      da_ultima_tecla_ate_lista_ms: stats(ateLista),
      regioes: [
        ...new Set(servidor.map((s) => s.split("::").slice(0, 2).join("::"))),
      ],
    };

    // 4) Enter com código/nome exato (findProductByCode) — 3 consultas em série no servidor.
    const enters: number[] = [];
    for (const termo of [
      "Coca-Cola 2L",
      "Arroz integral 1kg",
      "Sal refinado 1kg",
    ]) {
      await campo.fill("");
      await page.waitForTimeout(300);
      const esperaPost = page.waitForResponse(
        (r) =>
          r.request().method() === "POST" &&
          new URL(r.url()).pathname === "/caixa",
      );
      await campo.fill(termo);
      await campo.press("Enter");
      const resp = await esperaPost;
      enters.push(Math.round(resp.request().timing().responseEnd));
    }
    resultado["enter_codigo_post_ms"] = stats(enters);
  } finally {
    await deleteTestUser(user);
  }
  console.log("RESULTADO_JSON " + JSON.stringify(resultado));
});
