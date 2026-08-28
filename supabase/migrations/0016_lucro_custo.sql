-- =====================================================================
-- Gaveta — 0016: fechamento Lucro × Custo — plano 08, seção 2 (fase G3)
--
-- ⚠️ Banco COMPARTILHADO com o FiadoApp. Este arquivo NÃO altera nada:
-- cria duas funções de LEITURA. Elas leem `fiado_vendas`/`fiado_pagamentos`
-- (do FiadoApp) do mesmo jeito que `lib/financeiro/fiado.ts` já lê hoje —
-- somente select, sob a RLS do usuário. Nada em fiado_* é escrito.
--
-- Pergunta que o dono quer responder no fim do dia: do dinheiro que ENTROU,
-- quanto é CUSTO (recompor a mercadoria vendida → conta de recompra) e
-- quanto é LUCRO bruto (→ conta de lucro). Regime CAIXA.
--
-- Regras (decisões fechadas no doc 08):
--   • Custo = snapshot `sale_items.unit_cost` gravado na venda (G1). Item
--     sem custo NÃO entra no split — só é sinalizado (decisão 5).
--   • Taxas de cartão saem do LUCRO, nunca do custo: o valor de recompra é
--     intocável (2.2).
--   • Venda a prazo NÃO entra no dia da venda: entra no dia de cada
--     QUITAÇÃO, proporcional ao que foi pago (decisão 6) — coerente com a
--     regra de base caixa que o financeiro já usa.
--   • Despesas gerais (aluguel, salários…) não participam do split (2.4).
--
-- Agregação no banco, como `sales_summary`/`expenses_summary`: os valores
-- ficam exatos mesmo com milhares de linhas, sem depender de paginação.
-- =====================================================================

-- ---------- 1. lucro_custo_summary: os números do fechamento ----------
-- p_methods filtra a parte do CAIXA. 'fiado' não é forma de pagamento do
-- caixa, então o recebido a prazo entra só quando não há filtro de forma
-- (p_methods null) — com filtro, o card mostra exatamente o que foi pedido.
create or replace function public.lucro_custo_summary(
  p_from timestamptz,
  p_to timestamptz,
  p_methods text[] default null
)
returns table (
  recebido_vista      numeric,
  taxas               numeric,
  custo_vista         numeric,
  base_vista          numeric,
  base_coberta_vista  numeric,
  recebido_fiado      numeric,
  custo_fiado         numeric,
  base_fiado          numeric,
  base_coberta_fiado  numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
with vendas_vista as (
  select s.id, s.total, s.fee_amount
  from public.sales s
  where s.user_id = auth.uid()
    and s.status = 'completed'
    and s.created_at >= p_from
    and s.created_at <= p_to
    -- A venda a prazo entra pela quitação, não pela data da venda.
    and s.payment_method <> 'fiado'
    and (p_methods is null or s.payment_method = any(p_methods))
),
itens_vista as (
  select si.unit_cost, si.quantity, si.line_total
  from public.sale_items si
  join vendas_vista v on v.id = si.sale_id
),
-- Quanto de cada venda a prazo foi pago DENTRO do período, e a fração que
-- isso representa da venda (é essa fração que rateia custo e lucro).
fiado_periodo as (
  select
    fv.id as fiado_id,
    sum(p.valor_pago) as pago,
    case
      when fv.valor_total > 0 then sum(p.valor_pago) / fv.valor_total
      else 0
    end as proporcao
  from public.fiado_pagamentos p
  join public.fiado_vendas fv on fv.id = p.venda_id
  where p_methods is null
    and p.user_id = auth.uid()
    and fv.origem = 'gaveta'
    and p.pago_em >= p_from
    and p.pago_em <= p_to
  group by fv.id, fv.valor_total
),
-- Custo total da venda do Gaveta ligada a cada venda a prazo.
custo_da_venda_fiado as (
  select
    s.fiado_venda_id as fiado_id,
    sum(si.unit_cost * si.quantity)
      filter (where si.unit_cost is not null) as custo,
    sum(si.line_total) as base,
    sum(si.line_total)
      filter (where si.unit_cost is not null) as base_coberta
  from public.sales s
  join public.sale_items si on si.sale_id = s.id
  where s.user_id = auth.uid()
    and s.status = 'completed'
    and s.fiado_venda_id is not null
  group by s.fiado_venda_id
),
fiado_rateado as (
  select
    f.pago,
    f.proporcao * coalesce(c.custo, 0) as custo,
    f.proporcao * coalesce(c.base, 0) as base,
    f.proporcao * coalesce(c.base_coberta, 0) as base_coberta
  from fiado_periodo f
  left join custo_da_venda_fiado c on c.fiado_id = f.fiado_id
)
select
  coalesce((select sum(total) from vendas_vista), 0)::numeric(12,2),
  coalesce((select sum(fee_amount) from vendas_vista), 0)::numeric(12,2),
  coalesce((
    select sum(unit_cost * quantity) filter (where unit_cost is not null)
    from itens_vista
  ), 0)::numeric(12,2),
  coalesce((select sum(line_total) from itens_vista), 0)::numeric(12,2),
  coalesce((
    select sum(line_total) filter (where unit_cost is not null)
    from itens_vista
  ), 0)::numeric(12,2),
  coalesce((select sum(pago) from fiado_rateado), 0)::numeric(12,2),
  coalesce((select sum(custo) from fiado_rateado), 0)::numeric(12,2),
  coalesce((select sum(base) from fiado_rateado), 0)::numeric(12,2),
  coalesce((select sum(base_coberta) from fiado_rateado), 0)::numeric(12,2);
$$;

comment on function public.lucro_custo_summary(timestamptz, timestamptz, text[]) is
  'Fechamento Lucro x Custo (plano 08 secao 2): recebido, taxas, custo (snapshot unit_cost) e cobertura, com o fiado entrando pela quitacao, proporcional ao pago.';

-- ---------- 2. produtos_sem_custo: o que derruba a cobertura ----------
-- Lista, no MESMO recorte do fechamento, os produtos vendidos cujo item não
-- tinha custo gravado — é a lista do "informar custo agora" (decisão 5).
-- Item avulso (sem produto cadastrado) vem com product_id nulo: não há o
-- que corrigir nele, mas o valor precisa aparecer para a conta fechar.
create or replace function public.produtos_sem_custo(
  p_from timestamptz,
  p_to timestamptz,
  p_methods text[] default null
)
returns table (
  product_id uuid,
  nome text,
  valor numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
with vendas_vista as (
  select s.id
  from public.sales s
  where s.user_id = auth.uid()
    and s.status = 'completed'
    and s.created_at >= p_from
    and s.created_at <= p_to
    and s.payment_method <> 'fiado'
    and (p_methods is null or s.payment_method = any(p_methods))
),
sem_custo_vista as (
  select si.product_id, si.name_snapshot, si.line_total as valor
  from public.sale_items si
  join vendas_vista v on v.id = si.sale_id
  where si.unit_cost is null
),
fiado_periodo as (
  select
    fv.id as fiado_id,
    case
      when fv.valor_total > 0 then sum(p.valor_pago) / fv.valor_total
      else 0
    end as proporcao
  from public.fiado_pagamentos p
  join public.fiado_vendas fv on fv.id = p.venda_id
  where p_methods is null
    and p.user_id = auth.uid()
    and fv.origem = 'gaveta'
    and p.pago_em >= p_from
    and p.pago_em <= p_to
  group by fv.id, fv.valor_total
),
sem_custo_fiado as (
  select si.product_id, si.name_snapshot, si.line_total * f.proporcao as valor
  from fiado_periodo f
  join public.sales s
    on s.fiado_venda_id = f.fiado_id
   and s.user_id = auth.uid()
   and s.status = 'completed'
  join public.sale_items si on si.sale_id = s.id
  where si.unit_cost is null
),
tudo as (
  select * from sem_custo_vista
  union all
  select * from sem_custo_fiado
)
select
  product_id,
  -- Mesmo produto pode ter sido vendido com nomes diferentes ao longo do
  -- tempo (o snapshot guarda o nome da época): representa pelo nome da
  -- linha de maior valor. Item avulso não tem produto para nomear — a tela
  -- mostra um rótulo genérico e não oferece o atalho de corrigir.
  case
    when product_id is null then null
    else (array_agg(name_snapshot order by valor desc))[1]
  end as nome,
  sum(valor)::numeric(12,2) as valor
from tudo
group by product_id
order by sum(valor) desc;
$$;

comment on function public.produtos_sem_custo(timestamptz, timestamptz, text[]) is
  'Produtos vendidos no periodo cujo item nao tinha custo gravado — a lista do "informar custo agora" do fechamento Lucro x Custo.';
