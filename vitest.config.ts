import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
      // Ver tests/stubs/server-only.ts.
      "server-only": path.resolve(__dirname, "./tests/stubs/server-only.ts"),
    },
  },
  test: {
    // A suíte roda no relógio do SERVIDOR (UTC), não no desta máquina.
    //
    // Sem isto, um formatador de data sem fuso fixo passa aqui (a máquina do
    // dono está em Brasília) e mostra o dia errado em produção — foi assim
    // que o achado G sobreviveu ao PR #45. Rodar em UTC faz o teste ver o
    // que a Vercel vê.
    env: { TZ: "UTC" },
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    exclude: ["tests/e2e/**", "tests/rls/**", "node_modules", ".next"],
  },
});
