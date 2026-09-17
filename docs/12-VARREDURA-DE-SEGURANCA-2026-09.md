# 12 — Varredura de segurança (16/09/2026)

Pedido do dono, logo depois das melhorias de desempenho (PRs #48, #49 e
#50): **o que mais dá para fazer para o sistema ficar mais seguro do que é
hoje, sem comprometer funcionalidade nem o desempenho recém-ganho**.

Cada achado abaixo foi **verificado no ambiente real** (produção, banco ou
pacotes instalados), não deduzido do código. O que não foi possível
verificar está dito como tal. A ordem é por retorno sobre esforço.

## O que já está bem (e foi conferido de novo)

- **RLS em todas as tabelas** do schema `public` (consulta ao catálogo:
  nenhuma tabela sem `relrowsecurity`). Chamadas anônimas à API devolvem
  vazio (`products` → `[]`) e as RPCs que escrevem recusam ("Não
  autenticado").
- **Todas as funções `security definer` fixam `search_path`** (nenhuma
  exceção no catálogo).
- **Cabeçalhos em produção**: CSP estrita com nonce e `strict-dynamic`,
  HSTS de 2 anos, `X-Frame-Options: DENY`, `Referrer-Policy`,
  `Permissions-Policy`, `Cross-Origin-Opener-Policy`.
- **Otimizador de imagem fechado**: `/_next/image` com URL externa devolve
  400; só arquivos de `/public` passam.
- **Nenhum segredo em arquivo versionado** (busca por padrões de chave
  `sb_secret_`, JWT, `postgresql://`, chave do Gemini: só placeholders).
- **Sair só por POST** (`/auth/sign-out` responde 405 a GET).
- **Rate limiting** em login, cadastro, recuperação, redefinição,
  reautenticação, importação de nota e leitura por IA.
- **Sessão verificada em duas camadas** desde o PR #50: assinatura no proxy
  (`getClaims`, ES256) e estado no layout (`getUser`), com o laço de
  sessão revogada provado e fechado.

## Estado em 17/09/2026

| #   | Achado                           | Estado                                                                     |
| --- | -------------------------------- | -------------------------------------------------------------------------- |
| 1   | Next 16.3.5                      | validado localmente, aguardando o dono                                     |
| 2   | Cookie sem `Secure`/`httpOnly`   | validado localmente, aguardando o dono                                     |
| 3   | Confirmação de e-mail            | **o dono decidiu NÃO ligar por enquanto**                                  |
| 4   | Validade do token (1 h)          | **o dono decidiu DEIXAR como está**                                        |
| 5   | Contas de teste no banco         | ✅ **feito**: 200 apagadas, sobraram as 3 reais; trava automática na suíte |
| 6   | Funções executáveis pelo anônimo | ✅ **feito**: migration `0024` aplicada                                    |
| 7   | `X-Powered-By`                   | pendente                                                                   |
| 8   | Zod em quatro ações              | pendente                                                                   |

## Achados, em ordem de prioridade

### 1. Next.js 16.2.9 com 11 avisos publicados (2 críticos) — atualizar para 16.3.5

`npm audit` (dependências de produção): `next` tem 11 avisos, corrigidos
em **16.3.5** (mesma versão maior, sem migração). Os que importam aqui:

| Aviso                                                                                                    | Aplica-se ao Gaveta?                                                                                                             |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Bypass do middleware/proxy** com Turbopack e `i18n.locales` de uma entrada (alto, GHSA-6gpp-xcg3-4w24) | Não diretamente: o projeto não configura `i18n`. Mas é a proteção de rotas inteira que está em jogo; não se deixa isso ao acaso. |
| **RCE no otimizador de imagem com AVIF** (crítico, GHSA-2xp9-vwfh-vxw4)                                  | Pouco: o otimizador só aceita arquivos de `/public`, então ninguém de fora entrega um AVIF. Ainda assim é RCE.                   |
| **RCE em servidores Windows** (crítico)                                                                  | Não: produção é Linux na Vercel.                                                                                                 |
| **Divulgação dos ids de Server Actions** a não autenticados (moderado, GHSA-955p-x3mx-jcvp)              | Mitigado: toda ação autentica na fronteira (RLS + `auth.uid()`), como o aviso recomenda.                                         |
| DoS em Server Actions, SSRF em rewrites, confusão de cache (altos/moderados)                             | Baixa exposição, corrigidos na mesma atualização.                                                                                |

Há mais 14 avisos em dependências transitivas (`undici`, `sharp`,
`postcss`, `js-yaml`, `nanoid`, `dompurify`…), **todos com correção sem
troca de versão maior** (`npm audit fix`).

**O que fazer**: PR com `next@16.3.5` + `eslint-config-next@16.3.5` +
`npm audit fix`, rodando `tsc`, lint, unitários e a suíte e2e. Risco baixo,
ganho alto. Não toca no desempenho.

### 2. Cookie de sessão sem `Secure` e sem `httpOnly` — confirmado em produção

Login real em produção com usuário descartável e leitura dos cookies do
navegador:

```
sb-…-auth   secure=false  httpOnly=false  sameSite=Lax
erp_theme   secure=false  httpOnly=false  sameSite=Lax
```

A documentação interna (`docs/05`) dizia "`Secure` em produção"; **não é o
que o navegador recebe**. O `@supabase/ssr` não põe `Secure` nem `httpOnly`
por padrão, e o projeto não passa `cookieOptions`.

Por que importa:

- **`httpOnly`**: hoje qualquer script na página lê o token de sessão. A CSP
  estrita torna um XSS improvável, mas é exatamente a segunda tranca que se
  quer quando a primeira falha. **O Gaveta não usa cliente Supabase no
  navegador** (`lib/supabase/client.ts` existe e ninguém o importa), então
  nada quebra ao esconder o cookie do JavaScript.
- **`Secure`**: o HSTS já força HTTPS depois da primeira visita, então a
  exposição prática é pequena — mas a flag é a garantia que não depende do
  histórico do navegador.

**O que fazer**: passar `cookieOptions: { httpOnly: true, secure: true }`
(em produção) nos dois `createServerClient` (`lib/supabase/server.ts` e
`lib/supabase/middleware.ts`), apagar `lib/supabase/client.ts` (morto) e
provar de novo com o mesmo teste de cookies. Sem custo de desempenho.

### 3. Confirmação de e-mail no cadastro está DESLIGADA (`mailer_autoconfirm: true`)

Lido em `/auth/v1/settings` do projeto. Qualquer pessoa cria conta com
qualquer e-mail, sem provar que o e-mail é dela. Consequências: contas de
spam sem custo; e uma pessoa que erra o próprio e-mail no cadastro perde a
recuperação de senha sem saber.

É **decisão de produto** do dono: ligar a confirmação acrescenta um passo
(abrir o e-mail e clicar) para um público que não é técnico. O código já
está pronto para os dois modos (`signup` trata `data.session` nulo e o
`/auth/callback` confirma o link). Se ligar, testar o fluxo de ponta a
ponta uma vez.

### 4. Validade do access token (1 h) — ajuste no painel do Supabase

Discutido no PR #50: um token copiado do aparelho **antes** do Sair vale
até vencer, para o banco (sempre foi assim) e agora também para o proxy.
Reduzir para **15 minutos** em Auth → Sessions → JWT expiry corta a janela
em 4× sem efeito perceptível: o refresh é silencioso e feito pelo próprio
proxy. Ação do dono, no painel.

### 5. 176 contas descartáveis de testes ficaram no banco

`auth.users` tem 179 contas; **176** são `rls-*`/`perf-*@example.com`
deixadas por execuções interrompidas das suítes (o teardown apaga só quando
chega ao fim). Não é brecha (RLS isola tudo), mas é superfície e ruído: várias
ainda têm sessões abertas no Auth, e o backup carrega lixo.

**O que fazer**: apagar via `auth.admin.deleteUser` (o `on delete cascade`
leva o que elas criaram) — **com o "pode" do dono**, porque é destrutivo,
ainda que só de contas de teste. E acrescentar ao `auth.setup.ts` uma
limpeza de contas `rls-*` com mais de 1 dia, para não voltar a acumular.

### 6. Funções RPC executáveis pelo papel `anon` (defesa em profundidade)

Por padrão do Postgres, toda função nova recebe `EXECUTE` para `PUBLIC`, e
o catálogo mostra as 29 funções do schema executáveis por `anon` —
inclusive funções de trigger (`handle_new_user`, `*_guard_*`,
`rls_auto_enable`) que ninguém deveria chamar pela API. Sondagem real:
`sales_summary` como anônimo devolve zeros, `register_sale` recusa,
`products` devolve `[]` — **a RLS e o `auth.uid()` seguram tudo hoje**.

**O que fazer** (migration aditiva, baixo risco): `revoke execute … from
anon` nas funções de trigger e nas RPCs, e `alter default privileges …
revoke execute on functions from public` para as próximas. É a segunda
tranca para o dia em que alguém escrever uma RPC sem checar `auth.uid()`.

### 7. `X-Powered-By: Next.js` (cosmético)

Produção anuncia o framework. `poweredByHeader: false` no `next.config.ts`
tira o cabeçalho. Zero risco, zero ganho real além de não facilitar
reconhecimento.

### 8. Validação de entrada: quatro ações sem Zod (baixo)

`caixa/actions.ts`, `financeiro/actions.ts`,
`financeiro/fiado-receber-actions.ts` e `estoque/compras/import-actions.ts`
validam à mão (tipos, limites, ids passados a RPCs tipadas `uuid`, que
recusam lixo). Nenhuma brecha encontrada; é uniformidade, não urgência.
Vale um schema para `registerSale` (itens, forma, parcelas, desconto) e um
`z.uuid()` nos ids.

## O que NÃO recomendo agora

- **MFA / TOTP**: público com pouca destreza; o custo de suporte supera o
  ganho para uma conta que só vê os próprios dados.
- **Proteção contra senha vazada (HaveIBeenPwned)**: é recurso do plano
  pago do Supabase.
- **Rate limit na busca do caixa**: é autenticada, filtrada pela RLS e
  custa 0,4 ms no banco; limitar só criaria falso positivo em quem digita
  rápido.

## Ordem sugerida

1. PR: Next 16.3.5 + `npm audit fix` (item 1).
2. PR: cookies `httpOnly` + `Secure` e remoção do cliente de navegador morto
   (item 2), com a prova de cookies repetida em produção.
3. Painel do Supabase, pelo dono: JWT expiry (4) e a decisão sobre
   confirmação de e-mail (3).
4. Limpeza das contas de teste com autorização (5) + guarda no `auth.setup`.
5. Migration de `revoke execute` (6), quando houver janela para migration.
6. `poweredByHeader: false` (7) e Zod nas quatro ações (8), quando passar
   por perto.
