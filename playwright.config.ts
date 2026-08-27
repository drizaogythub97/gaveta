import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

// Os testes de ponta a ponta criam um usuário DESCARTÁVEL (protocolo do
// docs/09) e conferem o banco depois — precisam das chaves do Supabase.
loadEnv({ path: ".env.local" });

const port = Number(process.env.PORT ?? 3000);

/**
 * BASE_URL permite rodar o MESMO suite contra um ambiente externo (ex.: o
 * Preview Deployment da Vercel):
 *
 *   BASE_URL=https://gaveta-erp-git-minha-branch.vercel.app npm run test:e2e
 *
 * Sem BASE_URL, roda em localhost e o Playwright sobe o `npm run dev`
 * sozinho. Com BASE_URL, o webServer é desligado (o alvo já está no ar).
 */
const externalBaseURL = process.env.BASE_URL?.trim();
const usaServidorLocal = !externalBaseURL;
const baseURL = externalBaseURL || `http://localhost:${port}`;

/**
 * Preview Deployment com "Vercel Authentication" ligada exige o segredo de
 * Protection Bypass for Automation (Vercel → Project → Settings →
 * Deployment Protection). Com ele em VERCEL_AUTOMATION_BYPASS_SECRET, o
 * suite roda contra o Preview sem passar pelo SSO. Sem ele, só localhost ou
 * um Preview público.
 */
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
const extraHTTPHeaders = bypass
  ? {
      "x-vercel-protection-bypass": bypass,
      "x-vercel-set-bypass-cookie": "true",
    }
  : undefined;

export const AUTH_DIR = "tests/e2e/.auth";
export const STATE_FUNCIONAL = `${AUTH_DIR}/funcional.json`;
export const STATE_VISUAL = `${AUTH_DIR}/visual.json`;
export const USERS_FILE = `${AUTH_DIR}/users.json`;

export default defineConfig({
  testDir: "./tests/e2e",
  // Um worker só: os testes autenticados compartilham usuário e estado de
  // banco, então a ordem/isolamento importa mais que a velocidade.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  // O servidor externo (Preview) responde mais devagar que o local.
  timeout: externalBaseURL ? 90_000 : 45_000,
  expect: {
    timeout: externalBaseURL ? 15_000 : 10_000,
    toHaveScreenshot: {
      // Tolerância mínima para antialiasing entre execuções.
      maxDiffPixelRatio: 0.01,
    },
  },
  use: {
    baseURL,
    extraHTTPHeaders,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
      teardown: "cleanup",
    },
    {
      name: "cleanup",
      testMatch: /.*\.teardown\.ts/,
    },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: [/.*\.setup\.ts/, /.*\.teardown\.ts/],
      dependencies: ["setup"],
    },
    {
      // Só as verificações visuais rodam também no celular (o funcional já
      // roda no desktop e exercita as mesmas Server Actions).
      name: "mobile",
      use: { ...devices["Pixel 7"] },
      testMatch: /.*-visual\.spec\.ts/,
      dependencies: ["setup"],
    },
  ],
  webServer: usaServidorLocal
    ? {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        // Primeira subida depois de um `npm run build` recompila tudo do
        // zero; 2 minutos ficavam apertados.
        timeout: 240_000,
      }
    : undefined,
});
