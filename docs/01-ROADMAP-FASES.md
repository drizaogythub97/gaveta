# 01 — Roadmap por Fases

Este é o plano de execução. As fases foram desenhadas para que o desenvolvimento seja **rápido porém seguro**, com uma primeira versão testável o quanto antes. A **Fase 0 exige ações suas** (Adriano) antes que o Claude Code consiga trabalhar de forma autônoma; as demais são majoritariamente automatizadas pelo Claude Code.

Legenda: 👤 = ação sua · 🤖 = Claude Code · ⏱️ = estimativa.

---

## FASE 0 — Pré-requisitos (suas ações) 👤 ⏱️ ~30–45 min

O objetivo é deixar as contas e segredos prontos. Você já tem **GitHub**; falta **Supabase** e **Vercel**.

### 0.1 — Criar o repositório no GitHub

1. Crie um repositório **público** chamado `erp-simples`.
2. **Não** adicione README/licença pelo site (o projeto já traz os seus).
3. Guarde a URL (ex.: `https://github.com/SEU-USUARIO/erp-simples`).

### 0.2 — Criar conta e projeto no Supabase

1. Acesse https://supabase.com e entre com o **GitHub** (login social, mais rápido).
2. Clique em **New project**.
   - **Name:** `erp-simples`
   - **Database Password:** gere uma senha forte e **guarde-a** (você vai usar raramente, mas não dá para recuperar).
   - **Region:** escolha **South America (São Paulo)** para menor latência.
   - **Plan:** Free.
   - **Security (opções na criação):** marque **"Enable automatic RLS"** (rede de segurança que ativa RLS em toda tabela nova — alinhado à nossa regra "RLS sempre ativo"). Deixe **"Enable Data API"** marcado (necessário para o `supabase-js`) e **"Automatically expose new tables"** marcado (seguro, pois o RLS default-deny protege tudo). Todas reversíveis nas configurações depois.
3. Aguarde ~2 min até o projeto provisionar.
4. Em **Project Settings → Data API**, copie:
   - **Project URL** → vai em `NEXT_PUBLIC_SUPABASE_URL`
   - **Publishable / anon key** → vai em `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Em **Project Settings → API Keys** copie a **secret / service_role key** → vai em `SUPABASE_SERVICE_ROLE_KEY`. **Trate como senha** (nunca exponha).
6. Em **Authentication → Providers**, confirme que **Email** está habilitado. Para o MVP, em **Authentication → Sign In / Providers → Email**, você pode **desativar "Confirm email"** temporariamente para testar mais rápido (reative antes de publicar).

### 0.3 — Criar conta na Vercel

1. Acesse https://vercel.com e entre com o **GitHub**.
2. Não precisa importar o projeto agora — faremos isso na Fase 6, quando houver código.
3. Apenas confirme que a conta existe e está vinculada ao seu GitHub.

### 0.4 — Entregar os segredos ao Claude Code

- Crie localmente o arquivo `.env.local` (copiando de `.env.example`) e cole os valores dos passos acima.
- **Checklist de saída da Fase 0:** repositório criado ✓ · projeto Supabase no ar ✓ · 3 chaves copiadas ✓ · conta Vercel pronta ✓.

> A partir daqui o Claude Code assume. Abra o Claude Code na pasta do projeto e siga este roadmap por fases.

---

## FASE 1 — Fundação do projeto 🤖 ⏱️ ~30 min

- Inicializar Next.js (App Router) + TypeScript + Tailwind + ESLint/Prettier.
- Instalar e configurar shadcn/ui com os tokens do [design system](./02-DESIGN-SYSTEM-IDOSOS.md).
- Estrutura de pastas, `npm scripts`, configuração de testes (Vitest + Playwright).
- Cliente Supabase para Server e Client Components (`@supabase/ssr`) + middleware de sessão.
- **Entregável:** app roda em `localhost:3000` com página inicial e conexão ao Supabase validada.

## FASE 2 — Banco de dados e segurança de dados 🤖 ⏱️ ~30 min

- Aplicar migração SQL com o [modelo de dados](./03-SEGURANCA-E-DADOS.md): tabelas `profiles`, `products`, `sales`, `sale_items`.
- **Habilitar RLS em todas as tabelas** e criar políticas por `user_id` (isolamento total).
- Trigger de criação de `profile` no signup; função transacional para registrar venda + baixar estoque.
- **Entregável:** banco com isolamento garantido e testes de RLS passando.

## FASE 3 — Autenticação e cadastro 🤖 ⏱️ ~45 min

- Tela de **login** (index do sistema), **cadastro** com **aceite obrigatório da política de privacidade**, e **recuperação de senha**.
- Proteção de rotas via middleware usando `supabase.auth.getUser()`.
- Mensagens de erro amigáveis em português simples.
- **Entregável:** fluxo completo de criar conta → logar → sair.

## FASE 4 — Produtos e Frente de Caixa 🤖 ⏱️ ~1h30 (MVP testável aqui ✅)

- CRUD de produtos, incluindo **código de barras opcional** e a opção **controlar estoque (sim/não)** — produtos como marmitas ficam sem quantidade definida.
- **Frente de caixa** (ver estratégia no [design system](./02-DESIGN-SYSTEM-IDOSOS.md#frente-de-caixa)): adição por **leitura de código de barras (scanner USB/teclado)**, busca com autocompletar, item avulso por digitação, cálculo automático, registro da venda com baixa de estoque **apenas para produtos que controlam quantidade**.
- **Entregável: PRIMEIRA VERSÃO TESTÁVEL** — dá para cadastrar produto e vender.

## FASE 5 — Dashboards 🤖 ⏱️ ~1h30

- Dashboard **inicial** (atalhos + indicadores: faturamento dia/mês, nº de vendas, estoque baixo).
- Dashboard **estoque** com filtros dinâmicos e listagem reativa.
- Dashboard **financeiro** com vendas, filtros e faturamento por período (hoje, 7d, 30d, mês, personalizado).
- **Entregável:** visão gerencial completa do MVP.

## FASE 6 — Deploy 🤖 + 👤 ⏱️ ~30 min

- 👤 Importar o repositório na Vercel e colar as variáveis de ambiente no painel.
- 🤖 Ajustar `redirect URLs` no Supabase para o domínio da Vercel; validar build de produção.
- **Entregável:** sistema no ar com URL pública (deploy automático a cada push).

> **Status (2026-06-21):** concluída. App em produção em
> `https://erp-simples.vercel.app` (deploy automático a cada push na `main`).
> Decisão: **não** vamos reativar "Confirm email", configurar SMTP próprio
> nem customizar templates de e-mail — fora do escopo. O reset de senha
> continua funcionando com os e-mails padrão do Supabase.

---

## Fases de melhoria pós-deploy (A–C) — ANTES das Fases 7 e 8

> Decisão (2026-06-22): antes de fechar segurança (7) e qualidade (8), entram
> três melhorias. **Marca do produto definida: "Gaveta".** Tudo em **branch**
> (a `main` é produção). A integração no código respeita os tokens atuais do
> sistema — **não trocar a paleta**; a identidade é que segue o sistema.

### FASE A — Identidade visual ✅ CONCLUÍDA (parte criativa)
- Nome do produto: **Gaveta** (pesquisa de disponibilidade feita; "Gestor" e
  "Galp" descartados — genérico/concorrido e marca registrada, respectivamente).
- Assets finais em **`assets/brand/`**, nas cores exatas dos tokens do sistema
  (`--primary #1b7a43`, `--foreground #1a1a1a`, branco). Ver `assets/brand/BRAND.md`.
- Inclui: ícones de app (master/512/192), `maskable` (192/512), `apple-touch-icon`,
  `favicon.ico` (+16/32/48), `og-image` (1200×630), wordmark horizontal e
  empilhado, marca isolada transparente e versões monocromáticas (tinta/branco).
- **Pendente (no Claude Code, em branch):** integrar — substituir
  `app/favicon.ico`, adicionar `app/icon.png`/`app/apple-icon.png`, criar
  `manifest.webmanifest` (referenciando inclusive os `maskable`), definir
  `metadata`/OpenGraph com `og-image.png` e exibir o nome **"Gaveta"** na UI.
  - ⚠️ "Gaveta" é a marca do **produto**, separada do `brand_name`/logo **por
    loja** que cada usuário já personaliza em Preferências. Não misturar.

### FASE B — Microinterações, loading e toasts 🤖 ⏱️ ~1h30
- Transições suaves entre telas/estados e animações de carregamento via
  `loading.tsx` (skeletons) por rota + transições CSS. **Sempre respeitar
  `prefers-reduced-motion`** e manter movimento sóbrio (público idoso).
- Sistema de **toasts** (sugestão: Sonner, compatível com o shadcn em uso).
- Toasts de orientação: (1) incentivar **personalização** (link p/ Preferências);
  (2) avisar do **modo tela cheia** da frente de caixa (este depende da Fase C).
- Toasts dismissíveis, `aria-live`, tempo generoso; "já vi isto" persistido em
  armazenamento **não sensível** (localStorage/cookie ou preferência do usuário).

### FASE C — Frente de caixa: desktop horizontal + tela cheia 🤖 ⏱️ ~2h
- Reorganizar o POS (`app/(app)/caixa/`) em layout de duas colunas que usa o
  espaço horizontal **sem rolagem** em telas grandes (`lg+`): busca/entrada de um
  lado, carrinho/totais do outro.
- **Modo tela cheia via atalho** (Fullscreen API) + botão.
- **Mobile permanece como está hoje** (restringir por breakpoints).
- ⚠️ **Atenção crítica:** o POS lê **código de barras como entrada de teclado**.
  O atalho de tela cheia precisa de tecla que **não** apareça em códigos de
  barras (ex.: `F11`/F-key dedicada, ou botão + modificador). Definir e testar
  para o scanner não disparar fullscreen sem querer.

> Depois de A(integração)+B+C aprovadas e mescladas, seguir para as Fases 7 e 8.

### (BACKLOG FUTURO) App Android nativo — fora do escopo atual
- Requisito do usuário: **sessão persistente** + **funcionamento offline**
  (guardar localmente e sincronizar quando reconectar). Isso aponta para **app
  nativo** (não só WebView/PWA). Decisão WebView × PWA→TWA × nativo **em aberto**.
- Dedicar **sprints próprios só de discussão** antes de implementar. Não iniciar
  junto das fases A–C/7/8.

---

## FASE 7 — Segurança aprofundada 🤖 ⏱️ ~1h

Ver fases detalhadas em [03-SEGURANCA-E-DADOS.md](./03-SEGURANCA-E-DADOS.md#fases-de-segurança):

- Validação de entrada (Zod) no cliente e servidor; rate limiting no login/cadastro.
- Headers de segurança (CSP, HSTS, etc.) e proteção CSRF.
- Revisão de RLS com testes automatizados de tentativa de acesso cruzado.
- Política de senha, sanitização e tratamento de erros sem vazar informação.
- Rodar `/security-review` e corrigir achados.

## FASE 8 — Qualidade, acessibilidade e polimento 🤖 ⏱️ ~1h

- Auditoria Lighthouse (meta ≥ 95 em Acessibilidade/Performance).
- Testes E2E (Playwright) dos fluxos críticos.
- Responsividade fina (mobile/desktop), estados de carregamento e vazio.
- Backup: documentar/automatizar export periódico do banco (compensa a ausência de backup no plano grátis).

## FASE 9 — Portfólio 🤖 + 👤 ⏱️ ~30 min

- Finalizar README com screenshots/GIF do sistema.
- Texto pronto para post no LinkedIn (decisões técnicas, aprendizados).
- Tag de versão `v1.0.0`.

---

## Caminho mais curto para "testável ainda hoje"

Fase 0 (você) → Fases 1–4 (Claude Code). Ao fim da Fase 4 já há um sistema funcional para testar localmente. Dashboards (Fase 5) e deploy (Fase 6) podem vir na sequência ou no dia seguinte.

## Preparação para migração futura (Cloudflare Pages)

- Manter o app sem dependências exclusivas da Vercel (evitar APIs proprietárias de runtime).
- Usar variáveis de ambiente padrão e `@supabase/ssr` (portável).
- Documentar no README o passo de migração. Detalhes na nota do [README](../README.md) e no guia de deploy.

## Evoluções pós-MVP (fora do escopo das 9 fases)

- **Preferências do usuário — taxas por forma de pagamento.** Criar uma seção
  "Preferências" onde o lojista cadastra as taxas que paga em cada método
  (ex.: Pix 0%, débito 1,5%, crédito 3,5%, vale 5%). Persistir em uma tabela
  `payment_fees` por `user_id` × `payment_method`. Os relatórios financeiros
  da Fase 5 ganham um filtro/coluna **"Faturamento líquido"** que aplica as
  taxas vigentes às vendas do período. A migração `0002_payment_method.sql`
  já grava `sales.payment_method`, então quando isso entrar bastará uma
  migração nova para `payment_fees` + ajuste do dashboard. Não implementar
  agora.

## Configuração de painel pós-deploy

- **Site URL e Redirect URLs de produção** no painel Supabase: além de
  `http://localhost:3000` (dev), incluir a URL da Vercel
  (`https://erp-simples.vercel.app`) e o `/auth/callback` correspondente.

> Decisão (2026-06-21): templates de e-mail customizados, SMTP próprio e
> reativação de "Confirm email" estão **fora do escopo**. O app usa os e-mails
> padrão do Supabase (suficiente para reset de senha).
