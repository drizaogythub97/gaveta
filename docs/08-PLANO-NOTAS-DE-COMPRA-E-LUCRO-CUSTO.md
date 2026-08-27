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

**Realidade do dono (decisão 1, jul/2026): as notas chegam como PDF (DANFE ou
espelho do pedido) e papel — raramente XML.** Portanto a via por IA é a PRINCIPAL.

| Via | Como funciona | Confiabilidade | Custo | Veredicto |
|---|---|---|---|---|
| **A) PDF/foto com IA (extração)** | Upload do PDF ou foto → servidor extrai texto do PDF (DANFEs têm camada de texto) e/ou envia à API de visão (Claude) → JSON de itens → tela de conferência. Mesmo pipeline para PDF, foto e espelho de pedido. | ~92–98% (PDF texto ≈ topo da faixa); conferência humana sempre | Centavos por nota (API) | **Via principal — fase G2** |
| **B) XML da NF-e (modelo 55)** | Se o XML existir (fornecedor é obrigado a fornecer se pedido), parse direto e 100% preciso. | 100% | Zero | Suporte incluído na G2 (barato de adicionar); vale pedir o XML aos fornecedores maiores |
| **C) QR/chave da NFC-e (consulta SEFAZ)** | Ler QR do cupom → portal SEFAZ do estado. | Baixa (varia por estado, captcha, instável) | Zero | **Não prometer** — estudo futuro |

Nota técnica da via A: 1) tenta extrair a camada de texto do PDF (grátis,
determinístico); 2) se o texto for suficiente, o próprio LLM estrutura os itens a
partir dele (barato); 3) se for PDF-imagem ou foto, vai como imagem para a visão.
A **chave de acesso de 44 dígitos** impressa na DANFE é extraída e usada para
bloquear nota duplicada. Chave da API só no servidor.

### 1.2 Fluxo (idêntico para PDF/foto/XML — muda só o extrator)

1. **Upload do PDF/foto/XML** (ou vários) na tela "Estoque → Entrada por nota".
2. **Extração no servidor** (validação Zod no resultado): chave de acesso quando
   houver (rejeita duplicada), fornecedor, itens (EAN quando presente, descrição,
   quantidade, valor unitário), total. Extrator = parser XML OU pipeline
   PDF-texto/visão (mesma saída JSON).
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

### 1.4 Observações da via principal (IA)

- LGPD ok (nota de compra não tem dado de consumidor final).
- Custo por nota: centavos (API); prever contador de uso simples.
- Espelho de pedido (não fiscal) passa pelo mesmo pipeline — sem chave de acesso,
  o sistema usa fornecedor+data+total como proteção contra duplicidade.
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
| **G1 — Fundação de custo** | `cost_price` em products (+ edição no cadastro), `unit_cost` snapshot em sale_items, cálculo do médio ponderado, backfill manual dos produtos atuais | — |
| **G2 — Entrada por nota (PDF/foto/XML)** | Extrator (PDF-texto → visão IA → XML), motor de match (EAN→nome→novo), tela de conferência, RPC transacional (compra+estoque+custo+despesa opcional) | G1 |
| **G3 — Fechamento Lucro × Custo** | Card do dia + filtros + cobertura + regra fiado/taxas | G1 (melhor após G2) |
| **G4 — Refinos da extração** | Melhorias de precisão, múltiplas notas em lote, QR NFC-e (se viável) | G2 |

Ordem decidida (dono, jul/2026): **G1 → G2 → G3 → G4** (ordem lógica).

## 4. Decisões (TODAS FECHADAS — jul/2026)
1. ✅ Formato real das notas: **PDF/espelho/papel** → via IA é a principal; XML suportado.
2. ✅ Ordem: **G1 → G2 → G3 → G4**.
3. ✅ Método de custo: **último custo** (racional: reserva de recompra a preço de hoje).
4. ✅ Compra importada lança **gasto automático** em `insumos`.
5. ✅ Item sem custo no fechamento: **só sinalizar** (excluído do split, com aviso e
   atalho "informar custo agora").
6. ✅ Fiado: estoque baixa na venda; **Lucro × Custo só na quitação** (proporcional em
   parciais) — coerente com a regra F6 existente (seção 2.2.1).

**Status: plano pronto para execução no Claude Code (G1 → G2 → G3 → G4).**
