# Handoff — 2026-06-22 (Identidade "Gaveta" + Fases A–C antes da 7/8)

> **Para o próximo agente Claude Code:** leia este arquivo **primeiro**, depois
> `CLAUDE.md`, depois `docs/01-ROADMAP-FASES.md`. Esta é a fotografia mais
> recente e **substitui** o `HANDOFF-2026-06-22.md` (handoff de deploy, que segue
> no repo como histórico e continua sendo a melhor fonte para o detalhe do
> **deploy**). Os de 2026-06-21 (segurança) e 2026-06-19 (Fases 3–5) seguem
> válidos como histórico.

---

## 0. TL;DR

> O sistema **continua no ar** em `https://erp-simples.vercel.app` (deploy
> automático a cada push na `main`). Nada de código mudou na produção nesta
> sessão.
>
> Definimos a **marca do produto: "Gaveta"** e produzimos a **identidade visual
> completa** (parte criativa) em `assets/brand/`, nas cores **exatas dos tokens
> do sistema**. Inserimos **três fases de melhoria (A–C) ANTES das Fases 7 e 8**
> (ver `docs/01-ROADMAP-FASES.md`). O **app Android virou backlog futuro**
> (precisa de app nativo p/ sessão persistente + offline; sprints próprios).
>
> **Próximo passo (você, Claude Code, em branch):** integrar a identidade
> (Fase A — integração), depois Fase B (microinterações/loading/toasts), depois
> Fase C (frente de caixa desktop + tela cheia). Só então Fases 7 e 8.

---

## 1. Marca "Gaveta" — o que foi decidido e por quê

- Nomes pesquisados e **descartados**: "Gestor" (genérico e saturado no nicho:
  eGestor, Gestor de Vendas, Gestor Loja, etc.) e "Galp" (**marca registrada** —
  Galp Energia, multinacional). Escolhido: **Gaveta** — sem conflito no nicho de
  PDV/gestão e com bom conceito (remete à "gaveta do caixa").
- Ressalva de SEO (não bloqueante): "gaveta" sozinho colide com termo genérico
  "gaveta de aplicativos" (Android). Mitigar com handle/domínio de marca
  (ex.: `gaveta.app`, `usegaveta.com`). Domínio exato não verificado.

## 2. Identidade visual — estado e arquivos

- **Parte criativa CONCLUÍDA** (feita fora do Claude Code). Todos os assets em
  **`assets/brand/`** (PNG; sem SVG por decisão do usuário). Guia completo em
  **`assets/brand/BRAND.md`**.
- **Cores = tokens do sistema** (`app/globals.css`): verde `--primary #1b7a43`
  (dark `#2fa05f`), tinta `--foreground #1a1a1a`, branco. O logo original (verde
  `#00A651`) foi **recolorido de forma determinística** para o verde do sistema.
  Contraste `#1b7a43` sobre branco ≈ 5,4:1 (passa AA).
- Inventário: `icon-master/512/192`, `icon-maskable-192/512`,
  `apple-touch-icon` (180), `favicon.ico` (+ `favicon-16/32/48`),
  `og-image` (1200×630), `wordmark-horizontal`, `wordmark-stacked`,
  `logo-mark` (transparente), `logo-mono-ink`, `logo-mono-white`, `BRAND.md`.
- Wordmark em **Inter Bold** (a fonte do app). O descritor "Frente de caixa e
  gestão simples" no `og-image` é **provisório** — trocar quando houver tagline.

### O que FALTA (você, em branch — "Fase A: integração")
1. Substituir `app/favicon.ico` pelo de `assets/brand/favicon.ico`.
2. Adicionar `app/icon.png` e `app/apple-icon.png` (Next App Router) a partir de
   `assets/brand/icon-512.png` e `apple-touch-icon.png`.
3. Criar `manifest.webmanifest` (name "Gaveta", theme/background, ícones incluindo
   os **`maskable`**) e linká-lo no `metadata`.
4. `metadata`/OpenGraph com `og-image.png` e título/descrição com "Gaveta".
5. Exibir **"Gaveta"** na interface onde fizer sentido (ex.: aba/título).
   ⚠️ **Não** confundir com o `brand_name`/logo **por loja** (Preferências) — são
   coisas separadas.

## 3. Política de trabalho (inalterada)

**`main` é PRODUÇÃO.** Cada melhoria em **branch** → push gera **Preview Deploy**
na Vercel → usuário valida → merge na `main` (deploy automático). Exceção: docs
podem ir direto à `main` quando o usuário pedir (este handoff e o roadmap são
docs).

## 4. O que fazer — Fases B e C (resumo; detalhe no roadmap)

- **Fase B — Microinterações, loading e toasts:** `loading.tsx`/skeletons por
  rota + transições CSS respeitando `prefers-reduced-motion`; sistema de toasts
  (Sonner) com dicas de personalização e (junto da Fase C) do modo tela cheia.
- **Fase C — Frente de caixa desktop + tela cheia:** em `app/(app)/caixa/`,
  layout horizontal de duas colunas sem rolagem em `lg+`, **mobile intacto**,
  modo tela cheia via atalho (Fullscreen API). ⚠️ O scanner de código de barras
  é **entrada de teclado** — escolher um atalho que não apareça em códigos.

## 5. Pendência de segurança ainda em aberto

- **Rotacionar a `service_role`** (foi exposta em chat em 2026-06-21). Passo a
  passo já entregue ao usuário. Locais: `.env.local` (dev/RLS) e env var
  `SUPABASE_SERVICE_ROLE_KEY` na Vercel (+ redeploy); código não tem hardcode
  (lido em `lib/env.ts`, usado só em `app/(app)/minha-conta/actions.ts`).
  Confirmar com o usuário se já foi feito antes de liberar a usuários reais.

## 6. Notas técnicas

- **Não trocar a stack nem a paleta.** A identidade segue o sistema, não o
  contrário (cores em `app/globals.css`).
- Armadilhas herdadas (ver handoffs anteriores): `middleware.ts` virou
  `proxy.ts` (não recriar); `getUser()` sempre no servidor; Zod no servidor;
  `register_sale` tem defaults na assinatura (não quebrar `tests/rls/`);
  acessibilidade alta (idosos) — `docs/02-DESIGN-SYSTEM-IDOSOS.md`.
- Commits/nomes em inglês; UI em pt-BR; Conventional Commits.
- Verificação por fase: `npm run lint && npx tsc --noEmit && npm run test &&
  npm run build`.
