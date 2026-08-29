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
6. **Merge** (regra atualizada em 2026-08-27): com a fase validada e **todos os
   testes verdes — incluindo o suíte contra o Preview** —, abrir o PR e mesclar
   sem esperar nova confirmação. O dono autorizou de forma permanente para não
   ser o gargalo entre sessões. Se algo ficou por validar, ou se a mudança
   extrapola o combinado, aí sim parar e perguntar.

## 4. Ritual técnico (já vigente no CLAUDE.md, reforçado)

- Branch a partir da `main` **atualizada** (não empilhar branches).
- Migrations **aditivas**, aplicadas antes do push; RLS em toda tabela nova.
- Antes de fechar: `npm run lint`, `npx tsc --noEmit`, `npm run test`,
  `npm run test:rls` (se mexeu em banco) e `npm run build`.
- Depois: `npm run test:e2e` (local) **e `npm run test:e2e:preview`** — o
  mesmo suíte contra o Preview, em build de produção. Só então fechar (§3).
- Merge por fase — não acumular para o fim.

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
- **Estado (2026-08-27)**: o segredo de bypass já está no `.env.local`, então
  `npm run test:e2e:preview` roda de verdade contra o Preview. A G2a foi
  validada assim: 33 testes passaram no Preview (build de produção), com os
  mesmos baselines visuais gerados em desenvolvimento — ou seja, a regressão
  visual é a mesma nos dois ambientes.

## 5.1 Validar a leitura por IA (fase G2d)

A via de IA é liberada por **variável de ambiente**, com o id da conta. Isso
cria um problema prático para o e2e: o usuário descartável só ganha id
DEPOIS que o `setup` roda, e o servidor já subiu com o ambiente fixo.

Por isso o suíte tem dois testes em `tests/e2e/ia-visao.spec.ts`:

- **o fechado por padrão roda sempre** — conta fora da lista não vê nada da
  via de IA;
- **o da leitura de verdade só roda com `IA_E2E_LIBERADA=1`**, na sequência
  abaixo.

Sequência para exercitar a leitura de verdade (feita em 2026-08-29):

1. criar uma conta descartável por script (service_role) e anotar o **id**;
2. subir o servidor com essa conta liberada:
   `PORT=3100 IA_VISAO_LIBERADA_PARA=<id> npm run dev`;
3. rodar o teste apontando para ele, sem recriar usuários:
   `BASE_URL=http://localhost:3100 IA_E2E_LIBERADA=1 npx playwright test tests/e2e/ia-visao.spec.ts --no-deps`;
4. apagar a conta descartável no fim.

**Não dá para validar a leitura por IA contra o Preview** com conta de teste:
lá a lista tem o id do dono, e não se põe id de teste em configuração de
produção. O que o Preview valida é o resto — inclusive o fechado por padrão.
A leitura em si, em produção, é conferida pelo dono na conta dele.

⚠️ **Chamada de rede com POST dentro do Vitest é inutilizável neste projeto**:
um POST de 1s em Node puro leva 21s no runner e, com `AbortSignal`, trava.
GET funciona. Portanto integração com API externa se testa por e2e, nunca
por unidade — o que se testa em unidade é a validação da resposta.

## 6. Encerramento da sprint — "encerre a sprint"

Quando o dono pedir para **encerrar a sprint**, o objetivo não é resumir: é
deixar o projeto pronto para **outra sessão retomar do zero**. Ele troca de
sessão e de agente; a seguinte só sabe o que ficou escrito.

1. **Working tree limpa**: PRs mesclados, branches apagadas, `main` local
   sincronizada, nada pendente sem commit.
2. **Roadmap** (`docs/01-ROADMAP-FASES.md`): o que foi entregue e validado, com
   nº do PR e hash do merge, e o que resta.
3. **Handoff**: estado atual, o que entrou na sprint, o **ponto de partida
   exato** da próxima sessão (passo a passo) e os gotchas novos. No Gaveta o
   handoff vive na **memória** do projeto (`sprint-handoff`), não no repo.
4. **Memórias** do projeto atualizadas — decisões novas com o porquê, acessos e
   técnicas que mudaram — e o índice `MEMORY.md` junto.
5. **Docs commitados** na `main` (exceção de documentação) e push.
6. **Resumo final**: o que a sprint entregou, estado da produção e o próximo
   passo planejado.

Regras que valem sempre: **nenhum segredo** em memória, handoff ou repositório
— só o nome da variável e onde ela mora. E atenção a uma armadilha real: a
memória é indexada pelo **caminho da pasta** do projeto, então renomear a pasta
orfaniza tudo (aconteceu aqui quando `erp-simples` virou `gaveta`; as memórias
antigas ficaram em `~/.claude/projects/C--Users-adria-Documents-erp-simples/`).
