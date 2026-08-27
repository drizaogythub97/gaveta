# 09 — Protocolo de Validação (vale para TODA fase/implementação)

> Regras permanentes definidas pelo dono (jul/2026). Leia junto com o CLAUDE.md
> no início de cada sessão. Valem para qualquer fase, correção ou melhoria.

---

## 1. Teste funcional automatizado com usuário descartável

- Toda funcionalidade entregue deve ser **exercitada de ponta a ponta pelo próprio
  agente**, sem depender de teste manual do dono.
- Usar **usuário descartável** (padrão de `tests/rls/helpers.ts`: `createTestUser`
  via service_role, removido ao final — o cascade de `auth.users` limpa os dados).
  **Nunca usar a conta real do dono**, nem gerar dados na conta dele.
- **Monitorar o banco**: além da UI, verificar por consulta que as tabelas mudaram
  como esperado (linhas criadas, valores corretos, movimentos gerados, nada órfão).
- Concluir explicitamente se o comportamento observado bate com o esperado.
- **Só pedir teste manual quando for estritamente necessário** — e, ao pedir,
  explicar o motivo (ex.: câmera/scanner físico, impressora Bluetooth, cobrança real,
  comportamento de aparelho específico).

## 2. Teste visual — desktop E mobile

- Verificar que nenhuma alteração de UI/UX **quebra o layout** nem **foge do padrão
  visual adotado** até aqui (tipografia, espaçamentos, cores de marca, componentes,
  modo Simples × Minimalista, acessibilidade AA: contraste, alvos ≥44px).
- Cobrir **as duas larguras**: desktop e mobile (incluindo o modo Minimalista).
- O Playwright já instalado cobre isso nativamente: emulação de dispositivos
  (`devices[...]`), screenshots e **regressão visual** (`toHaveScreenshot`).
  Se ainda assim faltar capacidade, **pesquisar e propor MCPs/skills** que
  possibilitem a verificação visual — informando ao dono antes de adotar.

## 3. Fechamento de cada entrega — formato obrigatório

Ao terminar, responder com:
1. **Resumo breve e objetivo** do que foi entregue;
2. **Resultado dos testes** (funcional + visual), dizendo o que passou;
3. **O que foi corrigido** durante o processo (se algo quebrou/foi ajustado);
4. **Se há necessidade de teste manual do dono — e por quê** (só quando inevitável);
5. **Link do Preview Deployment**, sempre;
6. **Aguardar autorização explícita do dono para o merge.** Nunca mesclar sozinho.

## 4. Ritual técnico (já vigente no CLAUDE.md, reforçado)

- Branch a partir da `main` **atualizada** (não empilhar branches).
- Migrations **aditivas**, aplicadas antes do push; RLS em toda tabela nova.
- Antes de fechar: `npm run lint`, `npx tsc --noEmit`, `npm run test`,
  `npm run test:rls` (se mexeu em banco) e `npm run build`.
- Merge por fase, após aprovação do preview — não acumular para o fim.

## 5. Como rodar os testes (local e contra o Preview)

```bash
npm run lint && npx tsc --noEmit && npm run test && npm run test:rls && npm run build
npm run test:e2e            # e2e local (o Playwright sobe o npm run dev sozinho)
npm run test:e2e:preview    # o MESMO suíte contra o Preview da branch atual
```

- `playwright.config.ts` aceita `BASE_URL`: sem ela, roda em `localhost` e sobe
  o servidor de desenvolvimento; com ela, aponta para o alvo externo e desliga
  o `webServer`.
- `scripts/e2e-preview.mjs` descobre a URL do Preview da branch (Vercel CLI e,
  se ela não estiver autenticada, o alias determinístico da branch), confere se
  o alvo responde e só então roda o suíte.
- **Proteção do Preview**: com "Vercel Authentication" ligada, nenhum teste
  automatizado entra. Duas saídas, ambas em *Vercel → Project → Settings →
  Deployment Protection*:
  1. **Protection Bypass for Automation** (recomendado — mantém o Preview
     privado): gere o segredo e exporte
     `VERCEL_AUTOMATION_BYPASS_SECRET=<segredo>`; o `playwright.config.ts` já
     envia o cabeçalho `x-vercel-protection-bypass`;
  2. desligar a proteção dos Previews (a URL passa a abrir para quem tiver o
     link — os dados seguem protegidos por login e RLS).
- Contas de teste: sempre **descartáveis** (`tests/e2e/auth.setup.ts` cria,
  `auth.teardown.ts` apaga). Como o banco é compartilhado com o FiadoApp e é o
  mesmo de produção, rodar contra o Preview NÃO muda o risco: os dados de teste
  nascem e morrem dentro da execução.
- Acessibilidade: `tests/e2e/a11y.ts` calcula contraste AA (WCAG 2.1) e tamanho
  de alvo direto no navegador, sem dependência externa.
