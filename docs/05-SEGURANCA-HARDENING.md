# Segurança & Hardening — Gaveta (ERP Simples)

> **Documento vivo.** Registra a postura de segurança do projeto: o que foi
> implementado, *por quê*, e **como foi verificado**. Serve a três leitores:
> (1) quem avalia o projeto e quer entender o cuidado com segurança;
> (2) o time/desenvolvedor em sprints futuras; (3) qualquer agente de IA que
> retome o trabalho.

---

## Por que este documento existe

O **Gaveta** é um ERP web multiusuário (cadastro de produtos, frente de caixa e
dashboards de faturamento) com foco em **usabilidade para pessoas idosas**. É um
projeto de portfólio, de código aberto, **em produção**.

Ele foi construído com **desenvolvimento assistido por IA**. A tese que este
projeto quer demonstrar é simples:

> **Software feito com IA pode ser seguro e íntegro — desde que o desenvolvedor
> saiba exigir isso.** A IA acelera a implementação, mas a barra de qualidade,
> o modelo de ameaças e a verificação são definidos por quem conduz. Segurança
> não foi um "extra no final": foi tratada como **requisito de primeira classe**,
> com uma fase dedicada, controles em camadas e **evidências de verificação**.

Este documento é a prova desse esforço.

---

## Princípios adotados

- **Defesa em profundidade.** Nenhuma camada é confiada sozinha: validação no
  cliente *e* no servidor; autorização no app *e* no banco (RLS).
- **Menor privilégio.** Cada usuário só enxerga os próprios dados; segredos de
  servidor nunca chegam ao navegador.
- **Falha segura e silenciosa para o atacante.** Mensagens de erro genéricas (sem
  vazar SQL/stack/segredos); enumeração de contas evitada na recuperação de senha.
- **Seguro por padrão.** Cabeçalhos restritivos, CSP estrita e RLS ativo em todas
  as tabelas — *opt-out* explícito, nunca *opt-in* esquecido.
- **Verificável.** Todo controle relevante tem uma forma de ser testado e foi
  testado (ver "Como verificamos").

---

## Modelo de ameaças (resumo)

| Ameaça | Mitigação principal |
|---|---|
| Acesso aos dados de outro usuário | **Row Level Security** por `user_id` em todas as tabelas |
| Sessão forjada / token adulterado | `supabase.auth.getUser()` no servidor (valida o token); nunca `getSession()` |
| Entrada maliciosa / malformada | Validação com **Zod no servidor**, não só no cliente |
| Vazamento de segredos | `service_role`/secret keys só no servidor; sem `NEXT_PUBLIC_` |
| Força-bruta / abuso de autenticação | **Rate limiting** por IP em login, cadastro e recuperação |
| XSS / injeção de script | **CSP estrita com nonce** + `strict-dynamic`; sem `unsafe-inline` em scripts |
| Clickjacking | `frame-ancestors 'none'` + `X-Frame-Options: DENY` |
| Downgrade para HTTP / sniffing | **HSTS** + `upgrade-insecure-requests` |
| MIME sniffing | `X-Content-Type-Options: nosniff` |

---

## Camadas de defesa implementadas

### 1. Autenticação e sessão
- Autenticação via **Supabase Auth** com `@supabase/ssr`.
- No servidor, as rotas são protegidas com **`supabase.auth.getUser()`**, que
  revalida o token junto ao provedor — **nunca** confiamos em `getSession()`
  (que apenas lê o cookie, sem validar).
- *Middleware* (`proxy.ts` → `lib/supabase/middleware.ts`) redireciona não
  autenticados e mantém a sessão atualizada, repassando cookies refrescados.

### 2. Autorização no banco — Row Level Security (RLS)
- **RLS habilitado em todas as tabelas** (`profiles`, `products`, `sales`,
  `sale_items`, `product_barcodes`, …).
- Políticas por operação (`select/insert/update/delete`) restritas a
  `auth.uid() = user_id`, com `with check` em escritas.
- Resultado: mesmo que a camada de aplicação falhasse, o banco **não entrega**
  dados de um usuário a outro.

### 3. Validação de entrada
- Schemas **Zod** em `lib/validations/`, aplicados **no servidor** (Server
  Actions) antes de qualquer operação — o cliente é conveniência, não fronteira
  de confiança.

### 3.1. Política de senha (alinhada ao NIST SP 800-63B)
- Em `lib/validations/password.ts`: **comprimento** mínimo (8) e máximo (72),
  **bloqueio de senhas comuns/previsíveis** (blocklist + sequências + baixa
  variedade) e **proibição de conter o nome ou o e-mail** do usuário.
- Privilegia comprimento e bloqueio de palpites em vez de exigir
  maiúscula/símbolo — escolha deliberada de **usabilidade para o público idoso**,
  com **dica acessível** (`aria-describedby`) nos formulários de cadastro e
  redefinição.

### 4. Gestão de segredos
- `service_role` / secret keys **exclusivas de servidor**; nunca com prefixo
  `NEXT_PUBLIC_`, nunca em Client Components.
- Segredos só em `.env.local` (dev) e no painel da Vercel (prod); `.env*` nunca
  é commitado. `.env.example` documenta as variáveis sem valores reais.

### 5. Rate limiting (anti força-bruta)
- **Upstash Redis** (`@upstash/ratelimit` + `@upstash/redis`), janela deslizante
  **por IP e por ação**, em `lib/rate-limit.ts`.
- Aplicado aos pontos sensíveis: **login (8/min), cadastro (5/min), recuperação
  (4/min), redefinição (6/min)**.
- Mensagem genérica ao usuário ("Muitas tentativas…"); *fail-open* apenas quando
  as credenciais do Redis não estão configuradas (ambiente local), ativo em
  produção.

### 6. Cabeçalhos de segurança & Content-Security-Policy
- Cabeçalhos estáticos em `next.config.ts` para **todas** as rotas:
  - `Strict-Transport-Security` (HSTS, 2 anos, `includeSubDomains`)
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy` (desliga câmera, microfone, geolocalização, topics)
  - `Cross-Origin-Opener-Policy: same-origin`
- **CSP por requisição com nonce** (`lib/security/csp.ts`, aplicada no
  `proxy.ts`): `script-src 'self' 'nonce-…' 'strict-dynamic'` — **sem
  `unsafe-inline` em scripts**. `frame-ancestors 'none'`, `base-uri 'self'`,
  `form-action 'self'`, `object-src 'none'`, `upgrade-insecure-requests`.
- A política libera apenas o necessário (domínio do Supabase em `connect/img-src`)
  e relaxa pontualmente **só fora de produção** (HMR em dev; toolbar da Vercel em
  Preview, via `VERCEL_ENV`), mantendo a CSP de **produção estrita**.

---

## Como verificamos (evidências)

Segurança sem verificação é torcida. Cada controle foi exercitado:

- **Qualidade contínua:** `tsc --noEmit`, `eslint` e `vitest` a cada entrega;
  `next build` para validar a configuração de produção.
- **Rate limiting (teste de ponta a ponta, em ambiente real):**
  - Disparo automatizado de **12 tentativas de login** com senha incorreta
    contra o *Preview Deployment*; observado o comportamento esperado: **8
    passam, da 9ª em diante o sistema bloqueia**.
  - Confirmação no **Upstash via REST** (`/keys/rl:*`, `/dbsize`) de que a chave
    `rl:login:<ip>:…` foi efetivamente gravada no Redis — provando que o controle
    está ativo no servidor, não só no código.
  - Esse mesmo método revelou um problema de configuração (variáveis de ambiente
    criadas como *Shared* não-linkadas na Vercel, portanto ausentes no runtime →
    *fail-open*). Corrigido para *Project / All Environments* e **re-testado até
    passar**.
- **Política de senha (testes unitários):** `tests/password.test.ts` cobre
  rejeição de senhas comuns/sequenciais/pouco variadas e de senhas que contêm o
  nome ou o e-mail, além da integração com o schema de cadastro.
- **RLS / acesso cruzado (testes automatizados):** suíte dedicada
  (`npm run test:rls`, **16 testes**) que cria dois usuários reais no Supabase e
  prova, para cada tabela e para o storage, que um usuário **não lê, edita,
  apaga nem forja** dados do outro: `profiles`, `products`, `sales`/`sale_items`
  (via `register_sale`), `product_barcodes`, `preferences_fees` e o bucket
  `brand-logos` (escrita restrita à pasta `user_id`; leitura pública por design).
- **Cabeçalhos & CSP:** inspeção das respostas HTTP do Preview confirmando todos
  os cabeçalhos e a CSP com nonce; verificação de que o Next aplica o **mesmo
  nonce** aos seus scripts (a CSP não quebra a aplicação). Nota **A** em
  *securityheaders.com*.
- **Acesso a Previews protegidos:** os *Preview Deployments* ficam atrás do
  **Vercel Deployment Protection**; os testes automatizados usam o segredo
  *Protection Bypass for Automation* — ou seja, a verificação é reproduzível por
  ferramentas, não dependente de cliques manuais.

---

## Roadmap de segurança

| Item | Status |
|---|---|
| RLS em todas as tabelas (por `user_id`) | ✅ Concluído |
| `getUser()` no servidor (sem `getSession`) | ✅ Concluído |
| Validação Zod no servidor | ✅ Concluído |
| Isolamento de segredos (sem `NEXT_PUBLIC_` em secrets) | ✅ Concluído |
| Rate limiting (login/cadastro/recuperação/redefinição) | ✅ Concluído e verificado |
| Cabeçalhos de segurança + CSP com nonce | ✅ Concluído e verificado |
| CSRF + flags de cookies (revisão dedicada) | ⏳ Planejado |
| Revisão de RLS com **testes de acesso cruzado** automatizados | ✅ Concluído e verificado |
| Política de senha (força mínima, feedback acessível) | ✅ Concluído e verificado |
| `/security-review` (varredura) + correção de achados | ⏳ Planejado |
| Backup do banco e plano de recuperação | ⏳ Planejado (Fase 8) |

---

## Nota sobre desenvolvimento assistido por IA

A implementação deste sistema foi acelerada por IA, mas a **direção técnica** —
o modelo de ameaças, a exigência de defesa em camadas, a recusa de atalhos
inseguros e a **insistência em verificar cada controle** — partiu do
desenvolvedor. A IA propôs e executou; o desenvolvedor definiu a barra e cobrou
evidências.

O objetivo de tornar este registro público é mostrar, com transparência, que
**"feito com IA" não é sinônimo de inseguro**. Pelo contrário: com requisitos
bem postos e verificação disciplinada, a IA vira um multiplicador de boas
práticas de segurança.

---

## Registro das sprints de segurança

### 2026-06-23 — Fase 7 (parte 1): rate limiting + cabeçalhos/CSP
- Implementado rate limiting via Upstash Redis em login, cadastro, recuperação e
  redefinição de senha.
- Adicionados cabeçalhos de segurança e **CSP estrita com nonce** (`strict-dynamic`).
- Verificação ponta a ponta no Preview (12 logins → bloqueio no 9º; chave
  confirmada no Redis via REST). Diagnosticado e corrigido o caso das variáveis
  *Shared* não-linkadas na Vercel.
- Ajustes: liberação de `vercel.live` na CSP apenas fora de produção; correção do
  `manifest.webmanifest` no *matcher* do middleware.
- **Pendente da Fase 7:** CSRF/cookies, testes de acesso cruzado de RLS, política
  de senha e `/security-review`.

### 2026-06-23 — Fase 7 (parte 2): testes de acesso cruzado (RLS)
- Adicionada suíte `tests/rls/isolation-extended.test.ts` cobrindo as tabelas e o
  storage introduzidos após a migration inicial: `profiles` (escrita cruzada),
  `product_barcodes`, `preferences_fees` e o bucket `brand-logos`.
- Suíte RLS total: **16 testes**, todos verdes contra o Supabase real
  (`npm run test:rls`).

### 2026-06-23 — Fase 7 (parte 3): política de senha
- `lib/validations/password.ts` (NIST-aligned): comprimento + blocklist de senhas
  comuns/previsíveis + proibição de conter nome/e-mail. Integrada aos schemas de
  cadastro e redefinição; dica acessível nos formulários.
- **8 testes unitários** novos (`tests/password.test.ts`), verdes.
- **Pendente da Fase 7:** CSRF/cookies e `/security-review`.

> Próximas entradas serão adicionadas ao concluir cada bloco da Fase 7.
