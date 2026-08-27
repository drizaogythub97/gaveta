import { test as teardown } from "@playwright/test";

import { deleteTestUser, loadUsers } from "./helpers";

/**
 * Apaga as contas descartáveis. O `on delete cascade` de auth.users leva
 * junto tudo que os testes criaram (produtos, compras, vendas, gastos,
 * movimentos e o par no FiadoApp) — nada fica sobrando no banco.
 */
teardown("remove os usuários descartáveis", async () => {
  const { funcional, visual } = loadUsers();
  await deleteTestUser(funcional);
  await deleteTestUser(visual);
});
