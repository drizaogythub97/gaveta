import { config as loadEnv } from "dotenv";
import path from "node:path";

loadEnv({ path: path.resolve(__dirname, "../../.env.local") });

/**
 * Roda UMA vez por execução da suíte de RLS, antes de tudo.
 *
 * Só serve para varrer contas descartáveis esquecidas por execuções
 * interrompidas. O `setupFiles` não serve para isto: ele roda uma vez por
 * arquivo de teste, e a varredura precisa acontecer uma vez só.
 */
export default async function globalSetup() {
  const { limparContasDeTesteAntigas } = await import("./helpers");
  const apagadas = await limparContasDeTesteAntigas();
  if (apagadas > 0) {
    console.log(`[limpeza] ${apagadas} conta(s) de teste antigas removidas.`);
  }
}
