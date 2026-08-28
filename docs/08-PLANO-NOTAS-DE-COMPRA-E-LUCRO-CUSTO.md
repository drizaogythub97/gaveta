# 08 — Plano: Entrada por Nota Fiscal + Fechamento Lucro × Custo

> Planejamento (Cowork, jul/2026). Codificação: Claude Code. Status: aguardando
> decisões do dono (fim do doc). Motivação: uso próprio diário do dono.

---

## 0. Viabilidade (resumo executivo)

**As duas funcionalidades são viáveis e se completam.** O elo entre elas é a peça
que hoje NÃO existe no schema: **preço de custo por produto**. A entrada por nota
(Feature A) alimenta o custo automaticamente; o fechamento Lucro × Custo
(Feature B) consome esse custo. Nenhuma das duas exige IA para o núcleo — a via
principal é **programática e determinística** (XML da NF-e). IA entra como
complemento opcional (nota sem XML, via foto).

O que o Gaveta já tem a favor:
- `product_barcodes` (múltiplos EAN por produto) → **match perfeito** com o campo
  `cEAN` da nota.
- `stock_movements` com histórico imutável → basta um novo tipo (`purchase`).
- Financeiro com filtros por período/forma de pagamento → a tela do fechamento
  reusa essa base.
- `expenses` com categoria `insumos` → a compra pode gerar despesa automática.

O que falta (tudo aditivo, padrão do repo):
- `products.cost_price` (custo médio) — **não existe hoje**.
- `sale_items.unit_cost` (snapshot do custo no momento da venda) — para o lucro
  histórico não mudar quando o custo mudar.
- Tabelas `purchases` + `purchase_items` (a nota importada e seus itens).

---

## 1. Feature A — Entrada de mercadoria por nota fiscal

### 1.1 As três vias possíveis (e a recomendação)

**Realidade do dono: as notas chegam como PDF (DANFE ou espelho do pedido) e papel.**
**Restrição nova (decisão 7, jul/2026): CUSTO ZERO — nada de API paga. Extração por IA
paga foi REMOVIDA do roadmap.**

| Via | Como funciona | Confiabilidade | Custo | Veredicto |
|---|---|---|---|---|
| **A) PDF com camada de texto** | DANFE/espelho gerado digitalmente carrega o texto embutido. Biblioteca Node (`pdf-parse`/`pdfjs-dist`) lê o texto no servidor e um parser determinístico reconhece o bloco de itens (descrição, EAN, qtd, vl. unit., total) e a chave de 44 dígitos. | **Alta** (é texto real, não adivinhação) | **R$ 0** — biblioteca open source | **Via principal — G2b** |
| **B) XML da NF-e** | Parse direto quando o fornecedor mandar o XML (vale pedir aos maiores). | 100% | **R$ 0** | Incluída na G2b (barato de somar) |
| **C) OCR local (Tesseract.js)** | PDF-imagem ou foto → OCR **no próprio navegador** do usuário, sem servidor e sem API. | Média/baixa em foto de papel amassado; melhor em digitalização limpa | **R$ 0** | **Opcional (G2c)** — só se A e B não bastarem |
| **D) IA de visão (API paga)** | — | — | centavos/nota | ❌ **REMOVIDA** (decisão 7) |
| **E) QR/chave via SEFAZ** | Portais estaduais instáveis, captcha, muitos exigem certificado. | Baixa | R$ 0 | ❌ Não prometer |

**Como saber se a via A cobre o seu dia a dia (teste de 10 segundos):** abra um PDF de
nota que você recebeu e tente **selecionar o texto com o mouse**. Se o texto selecionar
(vira azul) → tem camada de texto → **a extração gratuita funciona**. Se não selecionar
nada (é uma imagem escaneada) → só a via C (OCR) ou digitação manual.

**Fallback permanente:** a entrada **manual** (G2a) sempre existe e é o caminho garantido —
qualquer nota, qualquer formato, zero dependência externa.

### 1.2 Fluxo (idêntico para manual/PDF/XML — muda só a origem dos dados)

1. **Origem dos itens**: digitação manual (G2a) **ou** upload de PDF-texto/XML (G2b).
2. **Extração no servidor** (validação Zod no resultado): chave de acesso quando
   houver (rejeita duplicada), fornecedor, itens (EAN quando presente, descrição,
   quantidade, valor unitário), total. Extrator = parser XML OU parser de PDF-texto —
   ambos determinísticos, gratuitos e offline. Mesma saída JSON em todos os casos.
3. **Motor de correspondência**, nesta ordem por item:
   - a) `cEAN` bate com `product_barcodes` → **produto reconhecido**;
   - b) sem EAN ou sem match → busca por similaridade de nome (trigram/`ilike`)
     → **sugestão** (usuário confirma);
   - c) nada → **produto novo** (pré-preenchido: nome, EAN, custo; usuário define
     preço de venda — com sugestão por margem configurável).
4. **Tela de conferência (obrigatória — humano sempre confirma):** lista item a
   item com status (reconhecido/sugerido/novo), quantidade e custo editáveis.
   Nada entra no estoque sem confirmação.
5. **Confirmação executa em transação única (RPC):**
   - cria `purchases` + `purchase_items` (nota arquivada, chave única);
   - `stock_movements` tipo `purchase` (+quantidade) por item;
   - atualiza `products.stock_quantity` e o **custo médio ponderado**;
   - cadastra produtos novos (com EAN em `product_barcodes`);
   - (opcional, configurável) lança `expenses` categoria `insumos` no valor da
     nota → a compra aparece no financeiro.

### 1.3 Método de custo — DECIDIDO: **último custo**

O `products.cost_price` sempre recebe o custo da compra **mais recente** (nota
importada ou edição manual). Racional do dono: a separação diária serve para
**recomprar à vista pelo preço de hoje** — o último custo reserva o valor de
reposição correto, sobretudo com preços subindo. O histórico de custos de cada
compra fica preservado em `purchase_items` (permite migrar para médio ponderado
no futuro sem perda, se um dia fizer sentido).

### 1.4 Observações

- **Nada sai da nossa infraestrutura**: parse de PDF e XML roda no servidor do próprio
  app (biblioteca open source), sem enviar documento para terceiros. Melhor para
  privacidade e custo (R$ 0).
- Layout de DANFE varia por emissor: o parser deve ser **tolerante** — extrai o que
  reconhece com confiança e deixa o resto para o usuário completar na conferência.
  Nunca "chutar" valores.
- Espelho de pedido (não fiscal) passa pelo mesmo caminho — sem chave de acesso,
  a proteção contra duplicidade usa fornecedor+data+total.
- A tela de conferência é o seguro de qualidade: NADA entra sem confirmação.

---

## 2. Feature B — Fechamento do dia: Lucro × Custo

### 2.1 Objetivo do dono
Ao fim do dia, saber **do dinheiro que ENTROU**: quanto é **custo** (recompõe a
mercadoria vendida → conta de recompra) e quanto é **lucro bruto** (→ conta de
lucro). Regime **caixa** (mesmo princípio já usado na integração FiadoApp).

### 2.2 Mecânica
- Na venda, cada `sale_items` grava `unit_cost` (snapshot do **último custo** do
  produto naquele momento). Item avulso/sem custo → `unit_cost` nulo (sinalizado).
- **Vendas à vista**: entram no fechamento do dia da venda.
- **Taxas de cartão** (já existem no financeiro): descontadas do LUCRO, nunca do
  custo (o custo de recompra é intocável — é o coração do objetivo).

### 2.2.1 Regra do fiado — IDENTIFICADA no código e estendida (decisão do dono)

Regra existente da integração (migration `0011_fiado_pdv.sql` + `lib/financeiro/fiado.ts`):
1. Venda fiado no PDV → RPC-ponte `registrar_venda_fiado` cria, em transação única,
   o a-receber no FiadoApp e a venda no Gaveta **com baixa de estoque imediata**;
2. `payment_method='fiado'` **não vincula ao caixa** — "o dinheiro entra depois,
   controlado no FiadoApp";
3. O financeiro do Gaveta soma "Recebido a prazo (FiadoApp)" lendo
   `fiado_pagamentos` **pela data do pagamento** (base caixa);
4. Exclusão em qualquer lado remove o par e **estorna o estoque**.

Extensão para Lucro × Custo (mesma filosofia, sem mudar a regra):
- **Estoque**: continua baixando na venda (inalterado).
- **Relatório Lucro × Custo**: a venda fiado NÃO entra no dia da venda. Entra no
  fechamento do **dia de cada quitação**, via `fiado_pagamentos` → venda ligada
  (`sales.fiado_venda_id`) → snapshots `unit_cost` dos itens.
- **Pagamento parcial** (F6 Fase 0): aloca custo/lucro **proporcionalmente** —
  recebeu X de uma venda de total Y ⇒ custo do dia += (X/Y) × custo_total_da_venda;
  lucro do dia += X − essa parcela. Somatório das parcelas fecha exato no total.
- **Exclusão/estorno**: venda removida (regra F6 Fase 3) sai do relatório
  automaticamente (pagamentos apagados junto, conforme fluxo Manter/Excluir).

### 2.3 A tela "Fechamento do dia"
Card no Financeiro (e atalho no fechamento de caixa):

> **Recebido hoje: R$ 500,00**
> 🟢 **Guardar p/ recompra (custo): R$ 320,00**
> 🔵 **Lucro do dia: R$ 168,00** (após R$ 12,00 de taxas)
> Cobertura de custo: 96% dos itens vendidos têm custo cadastrado ⚠

- Filtros reusados do financeiro: hoje / 7 dias / 30 dias / mês / personalizado
  + forma de pagamento. Extra: por produto/período (relatório de margem).
- **Indicador de cobertura**: % do valor vendido com custo conhecido. Itens sem
  custo listados com link "informar custo agora" (1 toque). Enquanto a cobertura
  < 100%, o card deixa claro que o lucro é estimado.
- Linha informativa opcional: lucro líquido do dia (lucro bruto − `expenses` do
  dia) — sem misturar com o split de contas.

### 2.4 O que NÃO entra no split
Despesas gerais (aluguel, salários…) não participam da divisão diária — o split
é sobre mercadoria vendida (CMV). Elas continuam no financeiro normal.

---

## 3. Fases para o Claude Code (todas com migrations aditivas + RLS + testes)

| Fase | Entrega | Dependências |
|---|---|---|
| **G1 — Fundação de custo** ✅ ENTREGUE (0013_cost_price.sql) | `cost_price` em products (+ edição no cadastro), `unit_cost` snapshot em sale_items (**último custo** — ver 1.3), preenchimento manual dos produtos atuais | — |
| **G2a — Núcleo de compras (manual)** ✅ ENTREGUE (0014_compras.sql) | Tabelas purchases/purchase_items, RPC transacional (compra+estoque+último custo+despesa automática), tela de entrada manual, histórico | G1 |
| **G2a.1 — Estorno de compra** ✅ ENTREGUE (0015_estorno_compra.sql) | Cancelar uma compra lançada por engano: reverte estoque (movimento `void`), remove/estorna o gasto em `expenses`, marca a nota como cancelada (não apaga histórico). Exige política de UPDATE/soft-delete em `purchases`. **Motivo: hoje não há como corrigir erro de digitação — em uso diário isso acontece.** | G2a |
| **G2b — Extração gratuita (PDF-texto + XML)** ✅ ENTREGUE (sem migration) | Upload → parser determinístico open source → motor de match (EAN→nome→novo) → mesma tela vira conferência | G2a |
| **G3 — Fechamento Lucro × Custo** ⬅ PRÓXIMA | Card do dia + filtros + cobertura + regra fiado/taxas | G1 (melhor após G2) |
| **G2c — OCR local (opcional)** | Tesseract.js no navegador para PDF-imagem/foto; só se G2b não cobrir | G2b |

Ordem decidida: **G1 ✅ → G2a ✅ → G2a.1 ✅ → G2b ✅ → G3 → (G2c opcional)**.

> ⚠️ **Regra de merge (CLAUDE.md):** cada fase é mesclada na `main` após aprovação do
> preview — não acumular branches. As migrations já são aplicadas no banco compartilhado
> antes do push, então a `main` não deve ficar atrás do banco por muito tempo.

## 4. Decisões (TODAS FECHADAS — jul/2026)
1. ✅ Formato real das notas: **PDF/espelho/papel** → via IA é a principal; XML suportado.
2. ✅ Ordem: **G1 → G2 → G3 → G4**.
3. ✅ Método de custo: **último custo** (racional: reserva de recompra a preço de hoje).
4. ✅ Compra importada lança **gasto automático** em `insumos`.
5. ✅ Item sem custo no fechamento: **só sinalizar** (excluído do split, com aviso e
   atalho "informar custo agora").
6. ✅ Fiado: estoque baixa na venda; **Lucro × Custo só na quitação** (proporcional em
   parciais) — coerente com a regra F6 existente (seção 2.2.1).
7. ✅ **Custo zero obrigatório**: extração por IA paga REMOVIDA. Só recursos gratuitos
   (parser de PDF-texto e XML open source, rodando na própria infra; OCR local opcional).
   Entrada manual é o fallback permanente.

**Status: plano pronto para execução no Claude Code (G1 → G2 → G3 → G4).**
