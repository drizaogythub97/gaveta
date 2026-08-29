import type { NextConfig } from "next";

/**
 * Headers de segurança estáticos, aplicados a todas as rotas (inclusive
 * assets). A Content-Security-Policy é dinâmica (precisa de nonce por
 * requisicao) e fica em `proxy.ts` / `lib/supabase/middleware.ts`.
 */
const securityHeaders = [
  // Forca HTTPS por 2 anos, incluindo subdominios.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  // Impede o navegador de "adivinhar" o MIME type.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Reforca frame-ancestors da CSP em navegadores antigos.
  { key: "X-Frame-Options", value: "DENY" },
  // Nao vaza a URL completa como referer para outros sites.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Libera a camera apenas para o proprio site (leitura de codigo de barras
  // pelo celular na frente de caixa). Demais APIs sensiveis seguem desligadas.
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), browsing-topics=()",
  },
  // Isola o contexto de navegacao (protege contra ataques cross-origin).
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  // O tesseract.js (leitura de nota por foto, G2c) resolve o caminho do
  // próprio worker a partir do disco. Empacotado, ele procura num caminho
  // reescrito pelo bundler e não se acha ("Cannot find module
  // .../worker-script/node/index.js"). Fora do pacote, a resolução do Node
  // volta a valer.
  serverExternalPackages: ["tesseract.js"],
  // O worker do tesseract.js é carregado por CAMINHO em tempo de execução
  // (`new Worker(...)`), então o rastreador de arquivos da Vercel não o
  // enxerga e não segue o `require('..')` que ele faz para o próprio pacote
  // — em produção isso dava "Cannot find module '..'". Aqui os dois pacotes
  // são incluídos por inteiro na função que lê nota por foto.
  outputFileTracingIncludes: {
    "/estoque/compras/nova": [
      "./node_modules/tesseract.js/**",
      "./node_modules/tesseract.js-core/**",
    ],
  },
  experimental: {
    serverActions: {
      // A importação de nota (G2b) envia o PDF/XML por Server Action. O
      // padrão do Next é 1 MB; um DANFE passa disso com folga quando traz
      // muitas páginas. O teto real de 8 MB é conferido no servidor
      // (lib/compras/tipos.ts) — aqui só cabe deixar o corpo chegar.
      bodySizeLimit: "10mb",
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
