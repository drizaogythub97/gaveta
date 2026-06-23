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
  // Desliga APIs sensiveis que o app nao usa.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  // Isola o contexto de navegacao (protege contra ataques cross-origin).
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
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
