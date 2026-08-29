/**
 * `server-only` existe só para o bundler quebrar o build se um módulo de
 * servidor for importado no cliente. No Vitest não há bundler de cliente, e
 * o pacote não resolve — este stub vazio mantém a proteção em produção e
 * permite testar os módulos de servidor.
 */
export {};
