import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Nenhum formatador de data fora de `lib/dashboard/dates.ts`.
 *
 * Um `Intl.DateTimeFormat` sem `timeZone` usa o relógio de QUEM RENDERIZA.
 * No servidor da Vercel isso é UTC: a venda das 21h de Brasília aparecia com
 * a data do dia seguinte, inclusive no comprovante impresso do cliente. O PR
 * #45 fixou o fuso na biblioteca, mas seis telas tinham criado o próprio
 * formatador na linha e ficaram de fora — foi o achado G de
 * `docs/10-ACHADOS-DE-LOGICA.md`.
 *
 * Esta regra existe para a classe de bug não voltar por um caminho novo:
 * quem precisar formatar data usa `formatDate`, `formatDateTime`,
 * `formatTime`, `formatDateOnly` ou `formatWeekday`, que fixam o fuso da
 * loja (ou, no caso do dia da semana, deliberadamente não fixam).
 */
const semFormatadorDeDataSolto = {
  files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}"],
  ignores: ["lib/dashboard/dates.ts"],
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        selector:
          "NewExpression[callee.object.name='Intl'][callee.property.name='DateTimeFormat']",
        message:
          "Formatador de data solto mostra UTC quando renderiza no servidor. Use formatDate/formatDateTime/formatTime/formatDateOnly/formatWeekday de @/lib/dashboard/dates.",
      },
      {
        selector:
          "CallExpression[callee.property.name=/^toLocale(Date|Time)String$/]",
        message:
          "toLocaleDateString/toLocaleTimeString usam o relógio de quem renderiza. Use os formatadores de @/lib/dashboard/dates.",
      },
    ],
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  semFormatadorDeDataSolto,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Estudos locais que não fazem parte do app (ver .gitignore).
    "fiadoapp-study/**",
  ]),
]);

export default eslintConfig;
