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

## Ecossistema Gaveta ⇄ FiadoApp (2026-07-12)

Pontes opt-in com o FiadoApp (estratégia aprovada pelo dono; cada ponte
nasce DESLIGADA, com liga/desliga próprio na página `/ecossistema`). A
tabela compartilhada `ecossistema_prefs` (criada por migrations do
FiadoApp, aplicadas ao banco comum) guarda as flags por usuário.

- **Descoberta** (PR #18, merge `6dc2771`): página `/ecossistema` + card em
  Configurações + anúncio dispensável no Painel (cookie
  `gaveta_ecossistema_anuncio`).
- **Estágio 1 — app switcher** (PR #19, merge `4db47fc`): botão/atalho para
  o FiadoApp no header e no menu "Mais", **opt-in** via toggle
  `ecossistema_prefs.switcher_ativo`.
- **Estágio 2 — marca única** (PR #20, merge `0f1472b`): toggle
  `marca_unica`; com a ponte ligada, salvar nome/logo grava nos dois apps
  (`profiles` ↔ `fiado_preferencias`, logo = mesmo arquivo do bucket
  compartilhado). **Política de retorno**: desativar restaura a marca
  anterior de cada app (backup em `ecossistema_prefs`, guarda
  `removerLogoSeguro` em `lib/ecossistema-server.ts`).

- **Integração "Fiado no PDV"** (2026-07-13) — **fundiu os Estágios 3+4+5**
  num fluxo só (sem tela de "caderno" isolada; o seletor de cliente vive no
  bloco de venda a prazo do caixa). Entregue em 5 fases:
  - **Fase 1** (PR #21, merge `8e27f36`): forma de pagamento "Venda a Prazo
    (Fiado)" no caixa (opt-in via `fiado_pdv_ativo`), combobox de clientes do
    FiadoApp + cadastro inline; migration 0011 (`'fiado'` no `payment_method`,
    `sales.fiado_venda_id`, RPC-ponte `registrar_venda_fiado` — cria o
    a-receber no FiadoApp + a venda `'fiado'` com baixa de estoque, atômico).
  - **Fase 2** (PR #22, merge `2017e50`): financeiro reflete o fiado (sem
    migration). `sales_summary` exclui `'fiado'` via `CAIXA_PAYMENT_METHODS`
    (financeiro E dashboard — corrige double-count); bloco "A receber via
    FiadoApp" (badge + link); realização por pagamento (`pago_em`).
  - **Fase 3** (PR #23, merge `0eeaddd`): exclusão consistente. RPC-ponte
    `excluir_venda_fiado` (migration 0012) remove os dois lados e estorna
    estoque (reusa `set_sale_status`); botão de excluir no bloco a-receber.
  - **Fase 4** (PR #24, merge `74f5a61`): desativar a ponte pede senha
    (reauth) + Manter/Excluir as vendas a prazo. Sem migration.

Componentes reutilizáveis: `eco-toggle.tsx`, `fiado-pdv-toggle.tsx` (toggle
com desativação protegida), `lib/ecossistema-server.ts` e
`lib/financeiro/fiado.ts` (leituras do fiado no financeiro). **As RPCs-ponte
que escrevem em `sales`/`fiado_vendas` vivem nas migrations do GAVETA**
(0011, 0012); o FiadoApp é dono de `ecossistema_prefs`/`fiado_*`. Contábil:
venda a prazo = a receber, entra no faturamento só quando paga no FiadoApp
(base caixa, projeção em tempo de leitura). Gotchas: `react-hooks/immutability`
barra `document.cookie =` em componente; opt-in é regra; **o `useEffect` de
foco do `ConfirmDialog` não pode ter `onClose`/`pending` nas deps** (rouba o
foco de campos ao digitar — corrigido, depende só de `[open]`). Badges de
referência ao FiadoApp = vermelho/coral + logo (`FiadoappBadge`).

## Nota de compra + Lucro × Custo (plano `docs/08-PLANO-NOTAS-DE-COMPRA-E-LUCRO-CUSTO.md`)

Ordem decidida pelo dono (revisada em jul/2026, decisão 7 = custo zero):
**G1 → G2a → G2b → G3 → (G2c opcional)**.

- **G1 — Fundação de custo** (2026-08-27, PR #26, merge `e845d51`): migration **0013**
  (`products.cost_price`, `sale_items.unit_cost`, ambas aditivas e opcionais,
  com check `>= 0`) + `register_sale` gravando o **snapshot** do custo em cada
  item vendido com `product_id` (item avulso → null). A venda a prazo herda o
  snapshot de graça: `registrar_venda_fiado` chama `register_sale`. Método de
  custo = **último custo** (decisão 3 do plano). UI: campo "Preço de custo
  (opcional)" no cadastro/edição de produto (`CurrencyInput`, vazio = custo não
  informado) e exibição discreta na lista de produtos. Testes:
  `tests/product-cost-price.test.ts` (Zod) e `tests/rls/cost-snapshot.test.ts`
  (snapshot à vista/fiado, imutabilidade histórica, isolamento por usuário).
  Nada de relatório aqui — o fechamento Lucro × Custo é a G3.

- **G2a — Núcleo de compras (entrada manual)** (2026-08-27, PR #27, merge
  `8ea1523`): migration **0014**
  — tabelas `purchases` (índice único parcial em `(user_id, access_key)` →
  mesma nota não entra duas vezes) e `purchase_items` (custo daquela compra
  preservado), tipo `'purchase'` em `stock_movements` e a RPC transacional
  **`registrar_compra(p_purchase, p_itens)`**: numa única transação grava a
  nota + itens, entra o estoque, aplica o **último custo** em
  `products.cost_price`, cria produtos novos (com `product_barcodes`) e lança
  o **gasto automático** em `expenses`/`insumos` na data da compra (decisão 4).
  Qualquer erro → nada é gravado. UI: `/estoque/compras/nova` (cabeçalho da
  nota + busca de produto **reusando as actions do PDV** + cadastro do produto
  novo na hora + confirmação com resumo), histórico em `/estoque/compras` e
  detalhe em `/estoque/compras/[id]`. Sem edição/exclusão de nota nesta fase —
  por isso `purchases`/`purchase_items` têm só políticas de SELECT e INSERT
  (**gotcha**: sem política de UPDATE, a RPC precisa somar o total ANTES de
  inserir a nota; um `update` pós-insert é silenciosamente ignorado pela RLS).
  Testes: `tests/purchase-validation.test.ts` (Zod) e `tests/rls/compras.test.ts`
  (grava tudo junto, produto novo com código, nota duplicada recusada, falha
  atômica não deixa rastro, isolamento por usuário). A extração de PDF/XML é a
  G2b.

- **G2a.1 — Estorno de compra** (2026-08-28, PR #29, merge `1cfb1ca`;
  migration **0015**): cancelar a nota lançada por engano sem apagar o
  histórico. `purchases` ganha `voided_at` (null = ativa) e `expense_id` — o
  vínculo com o gasto automático em `insumos`, que antes não existia (com
  backfill das notas já lançadas quando o casamento é inequívoco); por isso a
  `registrar_compra` passou a inserir o gasto **antes** da nota, para o id
  entrar já no insert. RPC **`estornar_compra(p_purchase_id)`**: numa única
  transação tira o estoque que entrou (movimento `'void'` com quantidade
  negativa), devolve o **último custo** ao da compra ativa anterior, remove o
  gasto e marca a nota. Regras de borda: se parte da mercadoria já saiu, o
  estoque baixa só até zerar (`stock_quantity >= 0`) e o retorno sinaliza
  `estoque_parcial`; custo digitado à mão depois da nota é respeitado;
  produtos criados pela nota **não** são apagados (podem já ter venda).
  A tabela ganhou política de UPDATE — necessária para a RPC — e, junto,
  um **trigger** (`purchases_guard_update`) que só deixa mudar o
  cancelamento e exige que ele venha da RPC (GUC local à transação): sem
  isso um `PATCH` direto na API marcaria a nota como cancelada deixando
  estoque e financeiro intactos. O índice único da chave de acesso passou a
  valer só entre notas **ativas**, então cancelar a nota errada libera
  relançar a mesma nota corrigida. UI: botão "Cancelar esta nota" no detalhe,
  com diálogo explicando os três efeitos, e selo "Cancelada" no detalhe e na
  lista (total riscado). Testes: `tests/rls/estorno-compra.test.ts` (9 casos)
  + 2 e2e funcionais e 2 visuais (desktop e celular).

- **G2b — Extração gratuita (PDF-texto + XML)** (2026-08-28, PR #30,
  merge `59562eb`; **sem migration**): a nota entra por arquivo e a tela da
  G2a vira a **tela de conferência**. Custo zero, tudo no próprio servidor —
  o documento não é enviado para nenhum serviço de terceiros (decisão 7).
  - `lib/compras/nfe-xml.ts` (via exata): `fast-xml-parser` sobre
    `nfeProc`/`NFe`/`infNFe`; chave pelo `Id` ou pelo `protNFe`, emitente,
    `dhEmi`, itens por `qCom`/`vUnCom` (unidade **comercial**, não a
    tributável) e `cEAN` — `"SEM GTIN"` vira sem código. Entidades do
    documento **não** são expandidas (XXE).
  - `lib/compras/danfe-pdf.ts` (via tolerante): `unpdf` (pdf.js empacotado,
    sem dependências). Reconstrói as **linhas visuais** pela posição dos
    fragmentos (agrupa por Y, ordena por X) em vez de concatenar o texto na
    ordem do arquivo, e reconhece a linha de item ancorada em **NCM + CFOP**,
    com ou sem a coluna de CST. PDF que é só imagem cai fora com aviso claro.
  - `lib/compras/numeros.ts`: **o formato do número é informado por quem
    chama**, nunca adivinhado — `"5.499"` vale 5,499 no XML e 5.499 no DANFE.
  - `lib/compras/correspondencia.ts`: motor **EAN → nome → novo**. A
    semelhança de nomes usa **Dice** sobre as palavras significativas, porque
    a descrição da nota costuma ser mais detalhada que o nome do cadastro
    ("ARROZ TIPO 1 5KG" × "Arroz 5kg" casa; "ARROZ INTEGRAL 1KG" × "Arroz
    5kg" não). Limiar 0,5.
  - `import-actions.ts`: sessão, **rate limit próprio** (`importar-nota`),
    limite de 8 MB e detecção de formato pelo **conteúdo** — não pela
    extensão nem pelo `type` do navegador. Duas consultas resolvem a nota
    inteira (códigos de barras + catálogo), sem uma ida ao banco por item.
  - UI: bloco "Tem o arquivo da nota?"; cada item com selo **Já cadastrado /
    Parecido — confira / Produto novo**, a descrição original ao lado para
    comparar, botão "não é este" no sugerido, e o **preço de venda agora
    editável na própria linha** (o arquivo traz o custo, nunca o preço).
    Importar sobre itens já digitados pergunta antes. A origem (`pdf`/`xml`)
    fica registrada na nota. **Nada é gravado sem a confirmação humana.**
  - `next.config.ts`: `serverActions.bodySizeLimit` (o padrão de 1 MB não
    comporta um DANFE de várias páginas).
  - Testes: `tests/nota-extracao-xml.test.ts`, `tests/nota-extracao-pdf.test.ts`
    (DANFE sintético montado com o `jspdf` que o app já usa) e
    `tests/nota-correspondencia.test.ts` — 38 casos; e2e
    `tests/e2e/importar-nota.spec.ts` (5) com conferência no banco, mais o
    visual da tela de conferência em desktop e celular.

- **G3 — Fechamento Lucro × Custo** (2026-08-28, PR #31, merge `670e9f5`;
  migration **0016**, só de LEITURA): a pergunta que motivou toda a linha de
  custo — do dinheiro que ENTROU, quanto guardar para repor a mercadoria e
  quanto é lucro. Regime caixa.
  - `lucro_custo_summary(from, to, methods)` e `produtos_sem_custo(...)`:
    agregação no banco, no padrão de `sales_summary`/`expenses_summary`
    (exatas com qualquer volume). Leem `fiado_*` só com `select`, como o
    `lib/financeiro/fiado.ts` já fazia — nada em fiado_* é escrito.
  - Regras (cada uma com teste): **taxa de cartão e desconto saem do LUCRO,
    nunca do custo** (o valor de recompra é intocável); **item sem custo não
    entra no split** — é sinalizado, não chutado, e a tela avisa que o lucro
    está por cima; **venda a prazo entra no dia da QUITAÇÃO**, rateada pelo
    que foi pago (o rateio é por venda, não por pagamento, então a soma das
    parcelas fecha exata); venda estornada sai do fechamento.
  - UI: aba **Fechamento** no Financeiro com o filtro de período existente,
    dois números grandes em linguagem direta (sem "CMV" nem "margem bruta" —
    há teste), lista do "informar custo" ligando ao cadastro do produto, e
    atalho a partir do fechamento de caixa. Cada bloco é uma `region`
    nomeada: melhora o leitor de tela e é por esse nome que o teste acha o
    valor.
  - **Decisão de conteúdo**: a linha informativa de despesas EXCLUI as
    compras de mercadoria (`insumos`) e explica isso — somá-las descontaria
    o mesmo dinheiro duas vezes (uma como custo de recompra, outra como
    gasto).
  - Testes: `tests/lucro-custo.test.ts` (8), `tests/rls/lucro-custo.test.ts`
    (12, incluindo o rateio do fiado), `tests/e2e/fechamento.spec.ts` (6,
    medindo a VARIAÇÃO que cada venda causa na tela) e
    `tests/e2e/fechamento-visual.spec.ts` (3: desktop, celular e Minimalista).

- **G2c — Leitura de nota de papel por OCR** (2026-08-29, PR #33, merge
  `5501a61`; **sem migration**): o caminho de quando não existe PDF-texto
  nem XML. Entrega deliberadamente modesta, e a tela diz isso.
  - **A medição que definiu o escopo**: numa digitalização real de ~90 DPI, o
    Tesseract lê as DESCRIÇÕES de forma utilizável e os NÚMEROS não
    (`3) 7300) — 7acof`), com confiança ~50%; ampliar e binarizar não mudou
    nada (49 → 51). Então a via devolve só a **lista de nomes**, com
    quantidade 1 e **custo em branco**. Chutar número seria pior.
  - Descoberta do mesmo teste: o documento nem era um DANFE, era **espelho de
    pedido** (sem CFOP). Por isso o OCR usa âncora própria — no
    reconhecimento as colunas não são confiáveis, mas **o nome vem em caixa
    alta e o lixo em minúsculas**; e só procura DENTRO do bloco de produtos,
    devolvendo vazio em vez de lixo quando não acha o bloco.
  - `danfe.ts` (novo): a interpretação saiu de `danfe-pdf.ts`. Qualquer
    leitor monta as mesmas "linhas visuais" e cai na mesma lógica.
  - `imagem.ts`: cinza, contraste, ampliação bilinear e Otsu em JS puro.
    Amplia **antes** de binarizar — na ordem inversa a interpolação devolve
    cinza na borda das letras.
  - `ocr-imagem.ts`: PDF digitalizado tem a foto embutida, então
    `extractImages` evita depender de rasterizador nativo. `tesseract.js` por
    import dinâmico. Recusa imagem incompleta ANTES de subir o OCR (PNG
    exige assinatura completa + IHDR; JPEG, SOI e EOI).
  - **Gotchas de produção, achados pelos logs do Preview** (o local não
    reproduz): `serverExternalPackages` para o worker se achar, e
    `outputFileTracingIncludes` com o **fecho inteiro** de dependências do
    tesseract.js (15 pacotes) — o rastreador não enxerga nada a partir de um
    worker carregado por caminho em tempo de execução.
  - Testes: `tests/nota-imagem.test.ts` e `tests/nota-ocr-nomes.test.ts`
    (30 casos) + e2e que gera a "foto" por screenshot no próprio navegador —
    nota de ninguém entra neste repositório, que é público.

- **G2d — Leitura de nota por IA de visão** (2026-08-29, PR #34, merge
  `83c5b30`; migration **0017**): a via mais forte para nota de PAPEL — e a
  única que manda o arquivo para FORA da infraestrutura do Gaveta.
  - **Fase de teste, liberada só para a conta do dono**, por **variável de
    ambiente** (`IA_VISAO_LIBERADA_PARA`), nunca por coluna no banco: as
    tabelas são expostas pela API, então uma flag de privilégio gravável pelo
    próprio usuário poderia ser auto-concedida. A checagem é feita **na
    server action**; esconder o botão é só conveniência.
  - Nunca dispara sozinha: é um botão separado, com diálogo dizendo que o
    arquivo sai do Gaveta e o que a nota contém. A ordem das vias continua
    XML → PDF-texto → OCR local → IA.
  - **Modelo escolhido por medição** na nota real do dono, com resultado
    IDÊNTICO nos três: `gemini-3.5-flash-lite` (4,9s), `gemini-2.5-flash`
    (17,4s), `gemini-3.7-flash` (67,7s). Ganho sobre o OCR local: 13 itens
    com nomes **e** valores, contra só nomes.
  - **A saída passa por Zod de novo**, mesmo com esquema estruturado na API:
    o esquema garante o FORMATO, não o VALOR. Valor fora de faixa é
    descartado em vez de entrar no estoque.
  - **Conferência de coerência**: a soma das linhas é comparada com o total
    impresso na nota, e a tela avisa quando não fecha. É o sinal mais barato
    de leitura incoerente — um modelo que inventou número dificilmente
    produz linhas que fecham no total.
  - Migration 0017: origem `'ia'` em `purchases.source` (constraint **e** a
    validação dentro da `registrar_compra`), para dar rastreabilidade — se um
    número errado chegar aos livros, dá para saber que veio de leitura
    automática.
  - Limite de taxa próprio (4/min, contra 10/min da importação normal):
    cada chamada consome cota da conta do dono.
  - Testes: `tests/nota-ia-visao.test.ts` (14 casos de validação da resposta
    e da liberação) + `tests/e2e/ia-visao.spec.ts`. O teste do **fechado por
    padrão** roda sempre; o da leitura de verdade roda na sequência do
    `docs/09` §5.1, porque o id do usuário descartável só existe depois do
    `setup`.

### Validação da G2a (protocolo `docs/09-PROTOCOLO-DE-VALIDACAO.md`)

Sessão de 2026-08-27 (PRs #27 e #28, merge `00330f8`), sem funcionalidade nova:

- **Funcional** (`tests/e2e/compras.spec.ts`, 11 testes): roda logado como
  **usuário descartável** (criado no `auth.setup.ts`, apagado no
  `auth.teardown.ts` — nunca a conta do dono) e confere **na UI e no banco**:
  navegação Estoque → nota, data futura e chave <44 dígitos recusadas pelo
  servidor, chave colada com espaços aceita, item existente por nome e por
  código já com o último custo, produto novo exigindo preço de venda,
  quantidade inválida barrada, total recalculando, resumo da confirmação,
  os **quatro efeitos** (estoque somado, `cost_price` da nota,
  `stock_movements` tipo `purchase`, `expenses` em `insumos` na data),
  nota duplicada recusada, histórico/detalhe, e a **regressão do PDV**
  (venda à vista e venda a prazo via ponte FiadoApp, com o snapshot
  `unit_cost` vindo do custo da nota).
- **Visual** (`tests/e2e/compras-visual.spec.ts`): projetos `desktop`
  (Desktop Chrome) e `mobile` (Pixel 7), nos modos Simples e Minimalista —
  sem rolagem horizontal, alvos ≥44px no conteúdo e regressão de screenshot
  (`toHaveScreenshot`) com estado semeado fixo.
- **Infra**: `playwright.config.ts` aceita `BASE_URL` (sem ela, sobe o
  `npm run dev`; com ela, usa o alvo externo e desliga o webServer) e
  `VERCEL_AUTOMATION_BYPASS_SECRET` para Previews com Vercel Authentication.
  Rodar contra o Preview:
  `BASE_URL=https://... VERCEL_AUTOMATION_BYPASS_SECRET=... npm run test:e2e`.
  Os baselines de screenshot têm sufixo de plataforma (`-win32`): outro SO
  gera o seu próprio na primeira execução.

**Encerramento da sprint (2026-08-27).** Entregues e em produção: G1
(fundação de custo), G2a (núcleo de compras) e a infraestrutura de validação
(e2e com usuário descartável, visual desktop/mobile com contraste AA, e o
mesmo suíte rodando contra o Preview — 33 testes verdes lá). Migrations
0001–0014 aplicadas. Regra de merge e ritual de encerramento atualizados no
`docs/09` (§3.6, §4 e §6). **Próxima sessão: G2a.1 (estorno de compra — exige
migration, porque `purchases` só tem políticas de SELECT/INSERT) ou G2b
(extração gratuita de PDF-texto/XML).** O ponto de partida detalhado está na
memória do projeto (`sprint-handoff`).
