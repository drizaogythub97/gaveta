# 02 — Design System (foco em idosos e acessibilidade)

Este documento define a identidade visual e as regras de interface. As escolhas são **baseadas em pesquisa** de UX para idosos e em diretrizes de acessibilidade (WCAG 2.1 AA, Apple HIG). Fontes ao final.

## Diretrizes-mãe (resumo da pesquisa)

A literatura de design para idosos converge em alguns pontos:

- **Fontes grandes (≥ 16px, idealmente 18–20px de base)** e tipografia sans-serif limpa (Inter, Open Sans, Arial). Permitir leitura sem esforço.
- **Alto contraste**: razão mínima 4.5:1 para texto (WCAG AA); preferir texto escuro sobre fundo claro.
- **Alvos de toque grandes**: mínimo 44×44px (Apple HIG), com **espaçamento generoso** entre eles para evitar toques acidentais (declínio de coordenação motora fina).
- **Navegação simples e consistente**: menu sempre no mesmo lugar, caminho claro de volta ao início, sem menus aninhados profundos.
- **Feedback imediato e óbvio**: botão muda de cor ao toque, mensagens de sucesso/erro visíveis e em linguagem simples.
- **Regra dos três toques**: qualquer ação essencial acessível em ≤ 3 toques.
- **Reduzir carga cognitiva**: uma tarefa principal por tela, evitar excesso de opções simultâneas, evitar gestos complexos (pinçar, swipe oculto).

## Identidade visual

### Paleta de cores

Cores sóbrias, com alto contraste e significado claro. Verde como cor primária transmite confiança/finanças positivas e tem boa legibilidade.

| Token | Hex | Uso |
|---|---|---|
| `primary` | `#1B7A43` (verde) | Ações principais, cabeçalho |
| `primary-hover` | `#155F34` | Estado de toque/hover |
| `text` | `#1A1A1A` | Texto principal (contraste ~16:1 no branco) |
| `text-muted` | `#4B5563` | Texto secundário (ainda AA) |
| `background` | `#FFFFFF` | Fundo principal |
| `surface` | `#F4F6F5` | Cartões/seções |
| `border` | `#D1D5DB` | Bordas/divisores |
| `success` | `#15803D` | Confirmações |
| `danger` | `#B91C1C` | Erros/exclusão |
| `warning` | `#B45309` | Alertas (ex.: estoque baixo) |

> Cada par texto/fundo deve ser validado para contraste ≥ 4.5:1. Evitar transmitir informação **apenas** por cor (usar ícone + texto também).

### Tipografia

- Fonte: **Inter** (fallback: system-ui, Arial).
- Escala base: `1rem = 18px` (maior que o padrão de 16px).
  - Corpo: 18px · Rótulos: 18px · Títulos de seção: 24–28px · Números de destaque (totais): 32–40px.
- Altura de linha confortável (1.5). Evitar texto em CAIXA ALTA em blocos longos.

### Espaçamento e toque

- Botões: altura mínima **56px**, padding horizontal generoso, cantos arredondados (8px).
- Espaço mínimo entre elementos interativos: **12px**.
- Campos de formulário: altura **56px**, rótulo sempre visível **acima** do campo (não usar só placeholder).
- Largura de conteúdo legível (máx ~640px em formulários).

### Componentes (shadcn/ui customizados)

- **Botão primário**: grande, verde, texto branco, ícone + rótulo textual ("Salvar produto", não só um ícone).
- **Campo de texto**: rótulo grande acima, mensagem de ajuda/erro abaixo em texto claro.
- **Cartão de indicador (dashboard)**: número grande, rótulo descritivo, ícone.
- **Selo (badge) de tipo de produto**: distingue visualmente, na lista de produtos e na frente de caixa, os dois tipos:
  - **"Estoque controlado"** — selo neutro/verde com ícone de caixa (📦) e o número da quantidade ao lado (ex.: "Estoque: 12"). Quando abaixo do mínimo, o selo fica em `warning` (âmbar) com texto "Estoque baixo".
  - **"Sob demanda"** — selo azul/cinza com ícone de relógio ou chapéu de chef (🍽️) e o texto **"Sob demanda"**, deixando claro que aquele item (ex.: marmita) não tem quantidade fixa. Nunca exibe número de estoque nem alerta de baixa.
  - Regras de acessibilidade: o selo usa **ícone + texto** (nunca só cor), contraste AA, e `aria-label` descritivo (ex.: "Produto sob demanda, sem controle de estoque").
- **Modais de confirmação**: para ações destrutivas ("Tem certeza que deseja excluir? Esta ação não pode ser desfeita."), com botão de cancelar em destaque.
- **Toasts**: feedback de sucesso/erro persistente por alguns segundos, com texto simples.

### Layout responsivo

- **Mobile-first.** Em telas pequenas: navegação inferior fixa (bottom nav) com 3–4 ícones grandes + rótulos (Início, Caixa, Estoque, Financeiro).
- **Desktop:** menu lateral fixo com os mesmos itens, rótulos sempre visíveis.
- Conteúdo em coluna única no celular; grade simples no desktop. Nada de tabelas densas no mobile — usar cartões empilhados.

## Frente de Caixa

> Estratégia definida com base em pesquisa de UX de PDV (ponto de venda). Princípios: poucos toques, busca rápida, erro difícil.

### Fluxo recomendado

1. **Campo único de adição de item**, grande, com **foco automático** (importante para o leitor de código de barras). As três formas de adicionar:
   - **Leitura por código de barras**: o leitor USB/Bluetooth funciona como teclado ("keyboard wedge") — ao bipar, ele digita o código no campo focado e envia Enter. O sistema busca o produto pelo `barcode` e o adiciona automaticamente à venda. (Câmera no celular = evolução futura.)
   - **Busca por nome (autocompletar)**: mostra produtos cadastrados. Ao selecionar, **preço vem preenchido** automaticamente (quantidade padrão = 1).
   - **Item avulso (digitação)**: se o produto **não existir**, digita-se o nome e os campos **valor** e **quantidade** ficam **editáveis manualmente**.
2. Item entra numa **lista do carrinho/venda**, mostrando nome, valor unitário, quantidade e subtotal. Cada item tem botões grandes de **+ / −** para quantidade e um botão de remover.
3. **Total** sempre visível e em destaque (número grande), recalculado automaticamente a cada mudança.
4. Botão grande **"Registrar venda"**. Após confirmar:
   - Grava a venda e seus itens (transação atômica no banco).
   - **Baixa o estoque** dos produtos cadastrados.
   - Mostra confirmação clara e limpa a tela para a próxima venda.

### Decisões de UX importantes

- **Não obrigar cadastro prévio** para vender (item avulso resolve o "vendi algo que não está no sistema").
- **Produtos sem controle de estoque** (`track_stock = false`, ex.: marmitas): vendem normalmente, **não baixam estoque** e **não aparecem** em alertas de "estoque baixo". No cadastro, um botão simples "Controlar estoque? Sim/Não" decide isso, escondendo o campo de quantidade quando não se aplica.
- **Código de barras é opcional** no cadastro do produto: produtos sem código (caseiros/não industrializados) são vendidos por busca de nome normalmente.
- **Quantidade por botões + e −** além de digitação — reduz erro de digitação em quem tem dificuldade motora.
- **Cálculo automático** sempre; o usuário nunca faz conta de cabeça.
- **Confirmação antes de gravar**, e venda recém-registrada pode ser **estornada/excluída** no dashboard financeiro (ação reversível).
- Performance: busca de produtos no servidor com índice por nome; resultados limitados e com *debounce* para não pesar no celular.

## Acessibilidade — checklist de implementação

- [ ] Todos os textos com contraste ≥ 4.5:1.
- [ ] Todos os alvos de toque ≥ 44×44px com espaçamento ≥ 12px.
- [ ] Foco visível em teclado; navegação por Tab funcional.
- [ ] Rótulos `aria-label`/`label` em todos os campos e botões com ícone.
- [ ] Mensagens de erro associadas aos campos (`aria-describedby`).
- [ ] Suporte a aumentar zoom do navegador até 200% sem quebrar layout.
- [ ] Lighthouse Acessibilidade ≥ 95 em todas as telas.

## Fontes da pesquisa

- [Aufait UX — Designing Elder-Friendly UI](https://www.aufaitux.com/blog/designing-elder-friendly-ui-interfaces/)
- [Toptal — A Guide to Interface Design for Older Adults](https://www.toptal.com/designers/ui/ui-design-for-older-adults)
- [PMC — Age-friendly mobile app design (systematic review)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12350549/)
- [dev.pro — Designing a POS System: 10 UX Tactics](https://dev.pro/insights/designing-a-pos-system-ten-user-experience-tactics-that-improve-usability/)
- [Shopify — POS System Design Principles](https://shopify.com/retail/pos-system-design)
- [Medium/uxjournal — The 16 UX Factors of the POS System](https://medium.com/uxjournal/pos-ux-design-part-one-the-16-ux-factors-in-point-of-sale-b94661936eea)
