import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(__dirname, "../../.env.local") });

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

for (const name of required) {
  if (!process.env[name]) {
    throw new Error(
      `Variavel ${name} ausente em .env.local — necessaria para testes RLS.`,
    );
  }
}
