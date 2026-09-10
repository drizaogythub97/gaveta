# Achados de lógica — varredura de 2026-09-10

Varredura do sistema em produção: caminho do dinheiro (venda, taxa, desconto,
estoque), lógica de datas, limites de consulta e coerência entre as telas.
Feita lendo o código do repositório **e as funções vivas do banco**
(`register_sale`, `registrar_venda_fiado`, `registrar_compra`,
`estornar_compra`), mais políticas e chaves estrangeiras.

> **Por que este arquivo existe.** Uma varredura anterior, no mesmo dia, foi
> perdida numa queda de energia: os achados viviam só na conversa. Achado que
> não está escrito no repositório não existe. Tudo aqui tem **arquivo e
> linha** para conferir, e nada aqui foi corrigido ainda — a ordem de ataque é
> decisão do dono.

Legenda de gravidade: **Alta** = número errado na tela ou dado perdido em uso
normal · **Média** = quebra em volume maior ou em caso de borda ·
**Baixa** = inconsistência que ainda não morde.

---

## A. O dia vira às 21h de Brasília — Alta ✅ CORRIGIDO (PR do fuso, migration 0022)

O sistema calcula as bordas do dia no **fuso do servidor**, que na Vercel é
**UTC**. Para um lojista brasileiro, o dia começa às 21h do dia anterior:
**toda venda feita das 21h em diante entra no relatório do dia seguinte.**

- `lib/dashboard/dates.ts:20` — `periodTimeZone()` devolve o fuso do servidor.
  É ele que alimenta `startOfDay`/`endOfDay` e que vai como `p_tz` às funções
  de agregação, então Painel, Financeiro, Fechamento (inclusive o dia a dia) e
  os filtros de data do Estoque compartilham o mesmo deslocamento.
- No banco, `current_date` também é UTC:
  - `supabase/migrations/0008_expenses.sql:11` — data padrão da despesa;
  - `supabase/migrations/0014_compras.sql:151` e `:160` (e as reemissões em
    0015, 0017, 0019, 0020) — data padrão da nota e a recusa de "nota do
    futuro";
  - `supabase/migrations/0011_fiado_pdv.sql:204-205` — data da venda a prazo
    **e o vencimento (+30 dias)**. Uma venda fiado às 21h30 nasce datada de
    amanhã e vence um dia depois do combinado.
- `lib/validations/purchases.ts:143` — a mesma recusa de nota futura, no
  cliente, usando `new Date().toISOString()` (UTC).

**Decisão do dono (2026-09-10): fixar o fuso em `America/Sao_Paulo`** para
todo mundo, em vez de configurável por conta. O dia passa a virar à
meia-noite de Brasília.

**Como foi corrigido:** trocar `periodTimeZone()` por uma constante
`America/Sao_Paulo`, passar esse fuso às funções do banco (elas já recebem
`p_tz`) e substituir os `current_date` por `(now() at time zone
'America/Sao_Paulo')::date` nas funções e nos defaults. **Atenção:** o
relatório de dias passados muda uma vez — as vendas da noite migram para o
dia certo. É esperado, e é a correção.

---

## B. Limites silenciosos de consulta — Alta e Média

Consultas que cortam resultado **sem avisar ninguém**. Nenhuma delas dá erro:
elas devolvem menos do que existe, e a tela apresenta o pedaço como se fosse o
todo.

| # | Onde | O que corta | Gravidade |
|---|---|---|---|
| 1 | `app/(app)/estoque/movimentacoes/page.tsx:19` | razão do estoque mostra **as 100 últimas** e não tem paginação | **Alta** |
| 2 | `app/(app)/estoque/compras/page.tsx:17` | histórico mostra **as 100 últimas notas**, sem paginação nem aviso | **Alta** |
| 3 | `app/(app)/estoque/page.tsx:50` | busca por código de barras só olha **200 códigos**; o produto seguinte não aparece | **Média** |
| 4 | `app/(app)/produtos/page.tsx:73` | filtro por categoria monta a lista de ids **sem limite** e a despeja na query string (~37 bytes por id) | **Média** |
| 5 | `app/(app)/estoque/compras/import-actions.ts:40` | pede **5000** produtos do catálogo, acima do teto padrão do PostgREST (1000 no Supabase): a intenção não se cumpre | **Média** |
| 6 | `app/(app)/caixa/sessao/page.tsx:38-49` | traz **todas** as vendas em dinheiro da sessão e soma no cliente; acima do teto, a conferência do caixa fecha com número **menor** que o real | **Média** |

O item 1 é o mais urgente na prática: **cada item vendido gera um movimento**,
então 100 linhas somem em poucos dias de uso, e a razão do estoque é
justamente o histórico que existe para auditar.

**Como corrigir:** paginação no banco (`range` + `count: "exact"`) nos itens 1
e 2, como já é feito em Produtos e no Financeiro; nos itens 3 e 4, casar por
subconsulta em vez de despejar ids na URL; no 5, paginar o catálogo ou casar
no banco; no 6, somar com agregação no banco, nunca trazendo linha por linha.

---

## C. A taxa da venda vem do cliente e é gravada como veio — Média

`app/(app)/caixa/actions.ts:139` recebe `feeAmount` já calculado no navegador
e o repassa; a função `register_sale` só garante que não é negativo
(`v_fee := round(greatest(coalesce(fee_amount,0),0),2)`). **O valor nunca é
conferido contra as taxas cadastradas em Preferências.**

Por que importa: o Fechamento desconta essa taxa do **lucro**. Se o cálculo do
navegador divergir do cadastro — versão antiga da tela aberta, preferência
alterada no meio do expediente, requisição forjada — o lucro sai errado e nada
denuncia.

**Como corrigir:** calcular a taxa dentro da `register_sale`, lendo
`preferences_fees` do próprio usuário. O cliente continua mostrando a
estimativa; quem grava é o banco. (A RLS não protege contra isso: o dado é do
próprio usuário.)

---

## D. Estoque cortado em zero, mas o movimento grava a quantidade cheia — Média

Na `register_sale`:

```sql
set stock_quantity = greatest(coalesce(stock_quantity, 0) - v_qty, 0)
...
insert into public.stock_movements (... quantity ...) values (..., -v_qty, ...)
```

Vender 5 unidades com 3 em estoque deixa o saldo em **0** e grava um movimento
de **-5**. A razão deixa de reconstruir o saldo: somar os movimentos passa a
dar um número diferente do `stock_quantity`, e a diferença é silenciosa.

**Como corrigir:** decidir a regra primeiro — ou recusar a venda acima do
estoque (com aviso claro no caixa), ou permitir saldo negativo, ou gravar no
movimento **o que realmente saiu**. Recusar é o mais honesto para o
inventário; permitir negativo é o mais honesto para o caixa. O que não pode é
a razão e o saldo discordarem.

---

## E. A busca do caixa não escapa curinga — Baixa

`app/(app)/caixa/actions.ts:19` e `:52`, e `app/(app)/caixa/fiado-actions.ts:35`,
montam o `ilike` **sem `escaparLike`** — diferente de Produtos
(`app/(app)/produtos/page.tsx:105`) e do Estoque (`app/(app)/estoque/page.tsx:49`),
que escapam.

Consequência: digitar `%` ou `_` casa com qualquer coisa. Buscar `50%` na
frente de caixa devolve o catálogo inteiro. Não é falha de segurança (o
PostgREST parametriza o valor), é resultado errado na tela mais usada.

**Como corrigir:** passar pelo `escaparLike` de `lib/db/like.ts`, como as
outras telas.

---

## F. O número de parcelas tem três limites diferentes — Baixa

- Tela: **2 a 12** (`app/(app)/caixa/pos-client.tsx`, `INSTALLMENT_OPTIONS`);
- Server Action: **2 a 24** (`app/(app)/caixa/actions.ts`);
- Banco: **1 a 24** (`register_sale`).

Ninguém tropeça hoje, porque a tela é a única porta. Mas são três verdades
para a mesma regra, e a próxima porta (integração, importação) vai escolher a
errada.

**Como corrigir:** uma constante só, validada no servidor e refletida na tela.

---

## O que já estava certo (conferido nesta varredura)

Vale registrar para ninguém "consertar" o que não está quebrado:

- **Sessão de caixa** — índice único parcial garante **uma** sessão aberta por
  usuário (`0007_cash_sessions.sql:32`). Não há corrida.
- **Produto de outro usuário na venda** — a `register_sale` confere
  `user_id` ao ler o produto, e não confia só na chave estrangeira.
- **Agregação no banco** — Painel e Financeiro somam por função
  (`sales_summary`, `expenses_summary`, `lucro_custo_summary`,
  `fechamento_por_dia`), não no cliente. A paginação de vendas do Financeiro
  corta no banco (20 por página).
- **`getSession()` não é usado no servidor**; a chave de serviço não aparece
  em nenhum componente de cliente.
- **Compra de mercadoria fica fora da linha de despesas** do Fechamento, para
  não descontar duas vezes.
