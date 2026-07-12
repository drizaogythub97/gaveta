# 01 — Roadmap por Fases

Este é o plano de execução. As fases foram desenhadas para que o desenvolvimento seja **rápido porém seguro**, com uma primeira versão testável o quanto antes. A **Fase 0 exige ações suas** (Adriano) antes que o Claude Code consiga trabalhar de forma autônoma; as demais são majoritariamente automatizadas pelo Claude Code.

Legenda: 👤 = ação sua · 🤖 = Claude Code · ⏱️ = estimativa.

---

## FASE 0 — Pré-requisitos (suas ações) 👤 ⏱️ ~30–45 min

O objetivo é deixar as contas e segredos prontos. Você já tem **GitHub**; falta **Supabase** e **Vercel**.

### 0.1 — Criar o repositório no GitHub

1. Crie um repositório **público** chamado `gaveta`.
2. **Não** adicione README/licença pelo site (o projeto já traz os seus).
3. Guarde a URL (ex.: `https://github.com/SEU-USUARIO/gaveta`).

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
> `https://gaveta-erp.vercel.app` (deploy automático a cada push na `main`).
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

### FASE B — Microinterações, loading e toasts ✅ CONCLUÍDA
- Transições suaves entre telas/estados e animações de carregamento via
  `loading.tsx` (skeletons) por rota + transições CSS. **Sempre respeitar
  `prefers-reduced-motion`** e manter movimento sóbrio (público idoso).
- Sistema de **toasts** (sugestão: Sonner, compatível com o shadcn em uso).
- Toasts de orientação: (1) incentivar **personalização** (link p/ Preferências);
  (2) avisar do **modo tela cheia** da frente de caixa (este depende da Fase C).
- Toasts dismissíveis, `aria-live`, tempo generoso; "já vi isto" persistido em
  armazenamento **não sensível** (localStorage/cookie ou preferência do usuário).

### FASE C — Frente de caixa: desktop horizontal + tela cheia ✅ CONCLUÍDA
- Reorganizar o POS (`app/(app)/caixa/`) em layout de duas colunas que usa o
  espaço horizontal **sem rolagem** em telas grandes (`lg+`): busca/entrada de um
  lado, carrinho/totais do outro.
- **Modo tela cheia via atalho** (Fullscreen API) + botão.
- **Mobile permanece como está hoje** (restringir por breakpoints).
- ⚠️ **Atenção crítica:** o POS lê **código de barras como entrada de teclado**.
  O atalho de tela cheia precisa de tecla que **não** apareça em códigos de
  barras (ex.: `F11`/F-key dedicada, ou botão + modificador). Definir e testar
  para o scanner não disparar fullscreen sem querer.

> Fases A–C **concluídas** e mescladas. As Fases 7 e 8 também (ver abaixo).
> As novas melhorias **D–H** (definidas em 2026-06-26) entram **antes da Fase 9**.

---

## FASE 7 — Segurança aprofundada 🤖 ⏱️ ~1h

Ver fases detalhadas em [03-SEGURANCA-E-DADOS.md](./03-SEGURANCA-E-DADOS.md#fases-de-segurança):

- Validação de entrada (Zod) no cliente e servidor; rate limiting no login/cadastro.
- Headers de segurança (CSP, HSTS, etc.) e proteção CSRF.
- Revisão de RLS com testes automatizados de tentativa de acesso cruzado.
- Política de senha, sanitização e tratamento de erros sem vazar informação.
- Rodar `/security-review` e corrigir achados.

> **Status: concluída** (ver `docs/05-SEGURANCA-HARDENING.md`).

## FASE 8 — Qualidade, acessibilidade e polimento 🤖 ⏱️ ~1h

- Auditoria Lighthouse (meta ≥ 95 em Acessibilidade/Performance).
- Testes E2E (Playwright) dos fluxos críticos.
- Responsividade fina (mobile/desktop), estados de carregamento e vazio.
- Backup: documentar/automatizar export periódico do banco (compensa a ausência de backup no plano grátis).

> **Status: concluída** (ver `docs/06-QUALIDADE-FASE8.md`).

---

## Melhorias pré-portfólio (D–H) — definidas em 2026-06-26, ANTES da Fase 9

> Tudo em **branch** (a `main` é produção). Pilares inegociáveis mantidos:
> **simplicidade/intuitividade** e **segurança** (RLS sempre, Zod no servidor,
> `service_role` nunca no cliente, erros genéricos, `getUser()` no servidor).
> Cada item pode virar uma branch própria. Migrações novas seguem a ordem
> `0006+` com RLS desde o início.

### FASE D — Caixa e estoque: correções e novos recursos ✅ CONCLUÍDA (PR #8, 2026-06-26)
- **Estorno que devolve o estoque** — feito via RPC transacional
  `set_sale_status` (substitui o update simples do `toggleSaleStatus`): estorno
  devolve quantidades, reativação rebaixa; idempotente; ignora `track_stock=false`.
- **Desconto na venda** — implementado **só no total** (decisão do dono):
  coluna `sales.discount_amount`, validação `0 ≤ desconto ≤ subtotal` no servidor
  e na RPC `register_sale`; campo no POS e exibição no Financeiro.
- **Histórico de movimentação** — tabela `stock_movements` (RLS, **só
  insert/select** = imutável), alimentada por venda/estorno (RPCs) e
  reposição/ajuste (nova RPC `adjust_stock`); página `/estoque/movimentacoes`.
- Migration `0006`. Bônus na mesma PR: correção de animações aceleradas sob
  `prefers-reduced-motion` + indicador "Buscando produto…" no POS.

### FASE E — Fechamento de caixa ✅ CONCLUÍDA (PR #9, 2026-06-26)
- `cash_sessions` (uma aberta por usuário, índice parcial único) + `cash_movements`
  (sangria/suprimento); `sales.cash_session_id` vincula vendas em dinheiro à
  sessão aberta (pix/cartão não vinculam).
- RPCs `open_cash_session` / `add_cash_movement` / `close_cash_session`;
  `register_sale` passou a vincular (sem mudar assinatura).
- Página `/caixa/sessao` (abrir, sangria/suprimento, fechar com conferência
  esperado×contado, histórico) + banner de status na frente de caixa.
- Esperado = troco + vendas em dinheiro concluídas + suprimentos − sangrias.
  Migration `0007`.

### FASE F — Financeiro: entradas, saídas e resumo ✅ CONCLUÍDA (PR #10, 2026-06-26)
- 3 abas via `?tab=`: **Vendas** (atual), **Despesas** e **Resumo**.
- `expenses` (categorias fixas: insumos/salários/aluguel/contas/impostos/outros),
  RLS + Zod, add/delete. **Despesas e estoque separados na v1.**
- Resumo: bruta, taxas, líquida, despesas por categoria, **resultado
  (líquida − despesas)**, fechamentos de caixa do período e **projeção do mês**
  rotulada como estimativa. Migration `0008`.

### FASE G — Impressão de comprovantes ✅ CONCLUÍDA (PR #11, 2026-07-01)
- **HTML/CSS + `window.print()`**: rota `/comprovante/[saleId]` (sob
  `getUser()` + RLS) que renderiza o comprovante e dispara a impressão.
  Formatos **bobina 80/58 mm** e **A4** via `@page` dinâmico. Na impressão, a
  largura é reduzida para a **faixa segura da bobina** (~72 mm de 80 mm; ~48 mm
  de 58 mm) e centralizada — evita o corte lateral da Epson TM-T20x. ESC/POS
  direto fica para o app nativo (Fase H).
- Gatilhos: modal "Imprimir comprovante? [Sim/Não]" após registrar a venda no
  caixa + botão "Imprimir venda" em cada venda no Financeiro.
- Preferências → seção **Impressão**: formato/largura, mostrar nome/logo
  (opcionais), mensagem de rodapé e **pré-visualização ao vivo**. Rodapé
  **"não tem valor fiscal"** sempre incluído. Total **sem** a taxa da maquininha;
  reflete desconto e estorno.
- Segurança: sem APIs de dispositivo/USB; dados da venda sob `getUser()` + RLS;
  textos do usuário renderizados como texto puro (React escapa) + limite via
  Zod (rodapé ≤120); nada é enviado a terceiros.
- Migration `0009` (profiles.receipt_*). Bônus na mesma PR: filtro de ordenação
  no Financeiro (recentes/antigas, maior/menor valor) e correção do bloco de
  total do caixa que sobrepunha a lista de itens ao rolar.

### FASE H — Mobile ✅ CONCLUÍDA como PWA (PR #12, 2026-07-01) — TWA pendente
> **Replanejada.** O app **nativo Kotlin** foi **descartado**: seu motivo era o
> uso **offline + sync**, requisito **REMOVIDO em 2026-06-26**. Sem isso, um
> segundo codebase não se justifica — e a segurança do Gaveta é **server-side**
> (RLS/`getUser()`/CSP), preservada 100% num invólucro que use o Chrome real.
> Entregue como **PWA** (mesmo app web, instalável, tela cheia) + **preparo de
> TWA** para a Play Store.
- **PWA instalável**: service worker mínimo (`public/sw.js`, **sem cache/offline**
  — não vazar dados de sessão) + registro (`components/app/pwa-register.tsx`).
- **Leitura por câmera** na frente de caixa (`components/app/barcode-scanner.tsx`,
  `BarcodeDetector`, com detecção de suporte). Header `Permissions-Policy:
  camera=(self)`. No desktop o leitor USB segue igual.
- **Compartilhar comprovante** (Web Share) enviando o comprovante **em texto**
  (a rota `/comprovante` é privada por RLS); `window.print()` segue para PDF.
- **Digital Asset Links**: `/.well-known/assetlinks.json` lendo
  `ANDROID_PACKAGE_NAME`/`ANDROID_CERT_FINGERPRINT` de env.
- **Impressão térmica Bluetooth (ESC/POS)**: fora de escopo no mobile — no
  celular basta emitir + compartilhar; impressão física fica no desktop/USB.
- **TWA / Play Store: PENDENTE (parte do dono)** — gerar o AAB com Bubblewrap,
  setar as envs na Vercel e publicar. Guia: `docs/07-MOBILE-PWA-TWA.md`.

> Depois: **Fase 9 (Portfólio)**.

## Objetos de estudo para o futuro (fora do escopo atual)
- **Integração com o FiadoApp (ecossistema do autor).** O Gaveta **não** terá
  fiado próprio; estudar integrar o **FiadoApp** (sistema do Adriano) ao Gaveta,
  fomentando um ecossistema de produtos integrados.
- **Multiusuário por loja (dono + funcionários).** Migrar do modelo `user_id`
  isolado para **loja-tenant + membros** (impacta toda a RLS). Épico próprio.
- **Fiscal (NFC-e/SAT).** Emissão fiscal real (certificado, SEFAZ): cara e
  complexa. Manter o comprovante **não fiscal** por ora.

---

## FASE 9 — Portfólio 🤖 + 👤 ⏱️ ~30 min ✅ CONCLUÍDA (2026-07-03)

- Finalizar README com screenshots/GIF do sistema. ✅ (2026-07-02)
- Texto pronto para post no LinkedIn (decisões técnicas, aprendizados). ✅ (2026-07-02)
- Tag de versão `v1.0.0`. ✅ Tag anotada + Release publicada no GitHub em
  2026-07-03 (`github.com/drizaogythub97/gaveta/releases/tag/v1.0.0`).

> **Status: concluída.** Todas as 9 fases + melhorias D–H entregues.
> Pendência manual do dono: publicar o TWA na Play Store (`docs/07-MOBILE-PWA-TWA.md`).

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
  (`https://gaveta-erp.vercel.app`) e o `/auth/callback` correspondente.

> Decisão (2026-06-21): templates de e-mail customizados, SMTP próprio e
> reativação de "Confirm email" estão **fora do escopo**. O app usa os e-mails
> padrão do Supabase (suficiente para reset de senha).

## Entrega pós-MVP: experiência mobile (2026-07-12)

Padrão mobile do FiadoApp v2 (spec `fiadoapp-v2/docs/05-MOBILE-UI-SPEC.md`)
replicado e validado pelo dono:

- **PR #16** (merge `05745cd`): modo Simples organizado no mobile (nav em
  grade 2 colunas), modo **Minimalista opt-in** por aparelho (cookie
  `gaveta_ui_mode` + variant CSS `minimal` + barra inferior + tela de
  escolha + seção em Preferências), escala densa validada, e fix do
  `noopener` (o Fechar do preview de comprovante voltou a funcionar).
- **PR #17** (merge `96437c8`): comprovante direto no celular — o caixa e o
  Financeiro perguntam **PDF/Imagem** e geram o arquivo no aparelho com
  share nativo (`components/receipt/emissor-comprovante.tsx` +
  `lib/receipt/data.ts` como loader único); compartilhar texto puro foi
  removido; rodapé do formulário de produto padronizado (h-12 text-base).

Gotcha de lint: `react-hooks/immutability` barra `document.cookie =` dentro
de componente — içar para função de módulo.
