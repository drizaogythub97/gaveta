import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { Page } from "@playwright/test";

import { USERS_FILE, AUTH_DIR } from "../../playwright.config";
import {
  createTestUser,
  deleteTestUser,
  userClient,
  adminClient,
  type TestUser,
} from "../rls/helpers";

export { createTestUser, deleteTestUser, userClient, adminClient };
export type { TestUser };

/**
 * Contas descartáveis do e2e (protocolo docs/09 §1): NUNCA a conta real do
 * dono. O `setup` cria, os testes usam, o `teardown` apaga — o cascade de
 * auth.users leva junto produtos, vendas, compras e gastos gerados.
 *
 * São duas para os testes não interferirem entre si:
 *   funcional → fluxo de ponta a ponta (cria dados o tempo todo);
 *   visual    → estado semeado e FIXO, para o screenshot não variar.
 */
export type UsersFile = {
  funcional: TestUser;
  visual: TestUser;
  /** Nota semeada para o usuário visual (histórico e detalhe estáveis). */
  visualPurchaseId: string;
  /** Nota semeada JÁ CANCELADA, para o visual do estorno (G2a.1). */
  visualVoidedPurchaseId: string;
};

export function saveUsers(users: UsersFile): void {
  mkdirSync(path.resolve(AUTH_DIR), { recursive: true });
  writeFileSync(path.resolve(USERS_FILE), JSON.stringify(users, null, 2));
}

export function loadUsers(): UsersFile {
  const file = path.resolve(USERS_FILE);
  if (!existsSync(file)) {
    throw new Error(
      "Usuários de teste não encontrados — o projeto 'setup' precisa rodar antes.",
    );
  }
  return JSON.parse(readFileSync(file, "utf8")) as UsersFile;
}

/** Faz login pela própria tela do app (mesmo caminho do usuário real). */
export async function loginPelaUI(page: Page, user: TestUser): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(user.email);
  // #password e não getByLabel: o campo tem o botão "Mostrar senha" ao lado,
  // que também responde pelo rótulo.
  await page.locator("#password").fill(user.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

/**
 * O aviso de personalização é um toast que fica na tela até o usuário
 * responder — atrapalharia clique e screenshot. Dispensa por armazenamento
 * local (o mesmo que o botão "Não mostrar novamente" faz).
 */
export async function dispensarAvisos(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.setItem("gaveta:personalization-tip:dismissed", "1");
  });
}

/** Data pura (YYYY-MM-DD) de hoje, no fuso do computador. */
export function hojeISO(): string {
  const agora = new Date();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${agora.getFullYear()}-${mes}-${dia}`;
}

/** Chave de acesso fictícia de 44 dígitos, única por execução. */
export function chaveFicticia(): string {
  const base = `${Date.now()}${Math.floor(Math.random() * 1e12)}`;
  return (base + "0".repeat(44)).slice(0, 44);
}

/**
 * Coloca o arquivo no seletor da nota — depois de a tela estar VIVA.
 *
 * `setInputFiles` dispara o evento `change` UMA vez só. Se o React ainda não
 * terminou de hidratar a tela, não há handler preso ao input: o evento se
 * perde, a leitura nunca começa e o teste espera para sempre por um painel
 * que não vem. Provado no log do servidor — no teste que reprovava, a ação
 * `importarNotaDeArquivo` sequer chegava a ser chamada. Só acontece com o
 * servidor de desenvolvimento ocupado, ou seja, quando a spec roda **depois
 * de outras**; sozinha ela sempre passou, e foi isso que escondeu a corrida.
 *
 * A espera observa as chaves internas que o React pendura no nó do DOM ao
 * hidratar (`__reactProps$…`, `__reactFiber$…`): é o sinal mais próximo de
 * "o handler já está aí" que dá para ver de fora.
 */
export async function enviarNota(
  page: Page,
  arquivo: { name: string; mimeType: string; buffer: Buffer },
): Promise<void> {
  const input = page.locator("#nota-arquivo");
  await input.waitFor({ state: "attached" });
  await page.waitForFunction(() => {
    const el = document.querySelector("#nota-arquivo");
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  });
  await input.setInputFiles(arquivo);
}
