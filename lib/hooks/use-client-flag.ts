import { useSyncExternalStore } from "react";

// Assinatura estável: a capacidade não muda durante a vida da página.
const subscribe = () => () => {};

/**
 * Lê uma capacidade só-do-cliente (ex.: `navigator.share`, câmera) sem causar
 * mismatch de hidratação nem `setState` dentro de efeito: no servidor devolve
 * `false`; no cliente, o resultado de `check()`.
 */
export function useClientFlag(check: () => boolean): boolean {
  return useSyncExternalStore(subscribe, check, () => false);
}
