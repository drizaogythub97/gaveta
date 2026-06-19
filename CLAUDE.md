# CLAUDE.md — Instruções do projeto para o Claude Code

Este arquivo orienta o Claude Code ao trabalhar neste repositório. Leia-o por inteiro antes de começar e siga o roadmap em `docs/01-ROADMAP-FASES.md`.

## O que é este projeto
ERP web simples e multiusuário: cadastro de produtos, frente de caixa (registro de vendas) e dashboards de faturamento. Público inicial: pessoas idosas → **usabilidade e acessibilidade são requisitos de primeira classe**. É um projeto de portfólio (repositório público) — código limpo e boas práticas importam.

## Stack (não trocar sem pedir)
- **Next.js (App Router) + TypeScript + React**
- **Tailwind CSS + shadcn/ui**
- **Supabase** (PostgreSQL + Auth + Row Level Security) via `@supabase/ssr`
- **Vercel** para deploy (manter portável para Cloudflare Pages — evitar APIs proprietárias)
- **Vitest** (unidade/integração) + **Playwright** (E2E)
- Validação com **Zod**

## Comandos
```bash
npm run dev        # desenvolvimento (localhost:3000)
npm run build      # build de produção
npm run lint       # ESLint
npm run test       # Vitest
npm run test:e2e   # Playwright
```

## Regras inegociáveis de segurança
1. **RLS sempre ativo** em todas as tabelas; políticas por `user_id`. Nunca desabilitar RLS.
2. A **`service_role` / secret key NUNCA** vai ao cliente. Sem prefixo `NEXT_PUBLIC_`, sem uso em Client Components. Só em Server Components, Route Handlers, Server Actions ou Edge Functions.
3. No servidor, proteger rotas com `supabase.auth.getUser()` — **nunca** confiar em `getSession()`.
4. **Validar toda entrada com Zod no servidor**, não só no cliente.
5. Nunca commitar `.env*`. Segredos só em `.env.local` (dev) e no painel da Vercel (prod).
6. Mensagens de erro ao usuário são genéricas; não vazar SQL/stack/segredos.

## Convenções de código
- TypeScript estrito (`strict: true`). Sem `any` desnecessário.
- Componentes em `components/`, lógica de dados em `lib/`, schemas Zod em `lib/validations/`.
- Server Components por padrão; `"use client"` só quando há interatividade.
- Nomes de variáveis/commits em inglês; **textos de interface em português** (claros e simples).
- Commits no padrão Conventional Commits (`feat:`, `fix:`, `chore:`...).
- Acessibilidade: seguir `docs/02-DESIGN-SYSTEM-IDOSOS.md` (contraste AA, alvos ≥44px, fontes grandes, rótulos aria).

## Estrutura de pastas (alvo)
```
app/                # rotas (login, signup, dashboard, caixa, estoque, financeiro)
  (auth)/           # login, signup, recuperação
  (app)/            # área autenticada
components/
  ui/               # shadcn/ui
lib/
  supabase/         # clients (server, client, middleware)
  validations/      # schemas Zod
supabase/migrations # SQL (0001_init.sql já existe)
docs/               # planejamento (esta documentação)
tests/              # vitest + playwright
```

## Fluxo de trabalho esperado
1. Seguir o roadmap por fases (`docs/01-ROADMAP-FASES.md`). Concluir uma fase antes da próxima.
2. Ao fim de cada fase: rodar `lint` + `test`, e descrever o que foi entregue.
3. Na fase de segurança, rodar `/security-review` e corrigir achados.
4. Não inventar requisitos fora do escopo do MVP (ver `docs/00-VISAO-GERAL.md`).

## Referências de documentação interna
- Visão e escopo: `docs/00-VISAO-GERAL.md`
- Roadmap: `docs/01-ROADMAP-FASES.md`
- Design/UX: `docs/02-DESIGN-SYSTEM-IDOSOS.md`
- Segurança/dados: `docs/03-SEGURANCA-E-DADOS.md`
- Privacidade/LGPD: `docs/04-POLITICA-PRIVACIDADE.md`
- SQL inicial: `supabase/migrations/0001_init.sql`
