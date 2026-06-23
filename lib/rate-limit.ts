import "server-only";

import { headers } from "next/headers";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Rate limiting para rotas sensíveis de autenticação (login, cadastro,
 * recuperação e redefinição de senha), usando Upstash Redis.
 *
 * Comportamento "fail-open": se as variáveis do Upstash não estiverem
 * configuradas (ex.: ambiente local sem as keys), o limite é ignorado e a
 * requisição segue normalmente. Em produção as keys estão sempre presentes.
 */

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = url && token ? new Redis({ url, token }) : null;

if (!redis && process.env.NODE_ENV === "production") {
  // Em produção, a ausência das keys desliga uma proteção importante.
  console.warn(
    "[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN ausentes — rate limiting DESATIVADO.",
  );
}

export type RateLimitAction = "login" | "signup" | "recover" | "reset";

/**
 * Janela deslizante por ação. Valores conservadores: protegem contra
 * brute-force/abuso sem atrapalhar uso legítimo (público idoso pode errar a
 * senha algumas vezes).
 */
const RULES: Record<RateLimitAction, { limit: number; window: `${number} s` }> =
  {
    login: { limit: 8, window: "60 s" },
    signup: { limit: 5, window: "60 s" },
    recover: { limit: 4, window: "60 s" },
    reset: { limit: 6, window: "60 s" },
  };

const limiters: Partial<Record<RateLimitAction, Ratelimit>> = {};

function getLimiter(action: RateLimitAction): Ratelimit | null {
  if (!redis) return null;
  if (!limiters[action]) {
    const { limit, window } = RULES[action];
    limiters[action] = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, window),
      prefix: `rl:${action}`,
      analytics: true,
    });
  }
  return limiters[action]!;
}

/**
 * Extrai um identificador estável do cliente (IP). Em Vercel/proxies o IP real
 * vem em `x-forwarded-for` (primeiro item) ou `x-real-ip`.
 */
async function getClientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return h.get("x-real-ip")?.trim() || "unknown";
}

export type RateLimitResult = { ok: true } | { ok: false; message: string };

/**
 * Verifica e consome uma unidade do limite para a ação/IP atual.
 * Retorna `{ ok: false, message }` (em português, genérica) quando estourado.
 */
export async function checkRateLimit(
  action: RateLimitAction,
): Promise<RateLimitResult> {
  const limiter = getLimiter(action);
  if (!limiter) return { ok: true };

  const ip = await getClientIp();
  const { success } = await limiter.limit(ip);

  if (success) return { ok: true };

  return {
    ok: false,
    message:
      "Muitas tentativas em pouco tempo. Aguarde um minuto e tente novamente.",
  };
}
