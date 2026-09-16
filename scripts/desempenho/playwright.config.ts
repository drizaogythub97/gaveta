import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
export default defineConfig({
  testDir: __dirname,
  workers: 1,
  retries: 0,
  reporter: "list",
  timeout: 600_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: "https://gaveta-erp.vercel.app",
    ...devices["Desktop Chrome"],
  },
});
