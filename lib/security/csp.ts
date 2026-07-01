import { publicEnv } from "@/lib/env";

/**
 * Monta a Content-Security-Policy da aplicacao usando um nonce por
 * requisicao. `strict-dynamic` permite que os scripts do Next (carregados a
 * partir de um script com nonce valido) funcionem sem liberar 'unsafe-inline'.
 *
 * - script-src: apenas 'self' + nonce; em dev libera 'unsafe-eval' (HMR).
 * - style-src: 'unsafe-inline' e necessario para os estilos injetados pelo
 *   Next/Tailwind e pelo next/font (risco baixo, nao executa codigo).
 * - connect-src/img-src: liberam o dominio do Supabase (auth/storage).
 */
export function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV !== "production";

  // A toolbar de comentários da Vercel (vercel.live) so e injetada em deploys
  // de Preview/Development. Liberamos seus dominios apenas nesses ambientes,
  // mantendo a CSP de PRODUCAO estrita.
  const allowVercelToolbar =
    process.env.VERCEL_ENV === "preview" ||
    process.env.VERCEL_ENV === "development";

  const supabaseOrigin = new URL(publicEnv.supabaseUrl).origin;
  const supabaseWs = supabaseOrigin.replace(/^https/, "wss");

  const vercelLive = allowVercelToolbar ? ["https://vercel.live"] : [];

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(isDev ? ["'unsafe-eval'"] : []),
      ...vercelLive,
    ],
    "style-src": ["'self'", "'unsafe-inline'", ...vercelLive],
    // Service worker da PWA (mesma origem).
    "worker-src": ["'self'"],
    "img-src": [
      "'self'",
      "data:",
      "blob:",
      supabaseOrigin,
      ...(allowVercelToolbar ? ["https://vercel.live", "https://vercel.com"] : []),
    ],
    "font-src": [
      "'self'",
      ...(allowVercelToolbar
        ? ["https://vercel.live", "https://assets.vercel.com"]
        : []),
    ],
    "connect-src": [
      "'self'",
      supabaseOrigin,
      supabaseWs,
      // WebSocket do HMR do Next em desenvolvimento.
      ...(isDev ? ["ws://localhost:*", "ws://127.0.0.1:*"] : []),
      // Toolbar da Vercel (canal em tempo real via Pusher).
      ...(allowVercelToolbar
        ? [
            "https://vercel.live",
            "https://*.pusher.com",
            "wss://*.pusher.com",
          ]
        : []),
    ],
    "frame-src": allowVercelToolbar ? ["https://vercel.live"] : ["'none'"],
    "frame-ancestors": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "object-src": ["'none'"],
  };

  const policy = Object.entries(directives)
    .map(([key, values]) => `${key} ${values.join(" ")}`)
    .join("; ");

  // Em producao, forca upgrade de requisicoes http -> https.
  return isDev ? policy : `${policy}; upgrade-insecure-requests`;
}
