-- =====================================================================
-- Gaveta — 0018: fechamento Lucro × Custo dia a dia
--
-- ⚠️ Banco COMPARTILHADO com o FiadoApp. Este arquivo NÃO altera nada:
-- cria duas funções de LEITURA, no mesmo molde da 0016. Elas leem
-- `fiado_vendas`/`fiado_pagamentos` (do FiadoApp) só com select, sob a RLS
-- do usuário. Nada em fiado_* é escrito.
--
-- Por que existe: a aba Fechamento respondia o período inteiro num número
-- só. O dono quer descer um nível — ver o dia a dia e, ao abrir um dia, as
-- vendas daquele dia com o que foi custo e o que foi lucro em cada uma.
--
-- As MESMAS regras da 0016, para os dias somarem exatamente o total do
-- período já mostrado no topo da aba:
--   • custo = snapshot `sale_items.unit_cost`; item sem custo não entra no
--     split, só derruba a cobertura;
--   • taxa de cartão sai do lucro, nunca do custo;
--   • venda a prazo entra no dia da QUITAÇÃO, proporcional ao pago.
--
-- ---------------------------------------------------------------------
-- Fuso (`p_tz`): quem manda é a aplicação, e ela passa o MESMO fuso que
-- usou para calcular as bordas do período (`lib/dashboard/dates.ts`). Isso
-- é o que garante que os dias somem exatamente o total do período — se as
-- bordas fossem de um fuso e o agrupamento de outro, "Hoje" viraria duas
-- linhas parciais.
--
-- Hoje esse fuso é o do servidor: UTC na Vercel. Existe uma imprecisão
-- conhecida e ANTERIOR a esta migração — para um lojista brasileiro o dia
-- deveria virar à meia-noite de Brasília, não às 21h. Corrigir isso muda os
-- números de todo o Financeiro e é decisão do dono; quando for feito, muda
-- num lugar só e estas funções acompanham.
-- =====================================================================

-- ---------- 1. fechamento_por_dia: uma linha por dia com movimento ----------
create or replace function public.fechamento_por_dia(
  p_from timestamptz,
  p_to timestamptz,
  p_tz text default 'UTC'
)
returns table (
  dia            date,
  recebido       numeric,
  taxas          numeric,
  custo          numeric,
  base           numeric,
  base_coberta   numeric,
  vendas         integer,
  recebido_fiado numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
with vendas_vista as (
  select
    s.id,
    (s.created_at at time zone p_tz)::date as dia,
    s.total,
    s.fee_amount
  from public.sales s
  where s.user_id = auth.uid()
    and s.status = 'completed'
    and s.created_at >= p_from
    and s.created_at <= p_to
    -- A venda a prazo entra pela quitação, não pela data da venda.
    and s.payment_method <> 'fiado'
),
vista_por_dia as (
  select
    v.dia,
    sum(v.total) as recebido,
    sum(v.fee_amount) as taxas,
    count(*)::integer as vendas,
    coalesce(sum(i.custo), 0) as custo,
    coalesce(sum(i.base), 0) as base,
    coalesce(sum(i.base_coberta), 0) as base_coberta
  from vendas_vista v
  left join lateral (
    select
      sum(si.unit_cost * si.quantity)
        filter (where si.unit_cost is not null) as custo,
      sum(si.line_total) as base,
      sum(si.line_total)
        filter (where si.unit_cost is not null) as base_coberta
    from public.sale_items si
    where si.sale_id = v.id
  ) i on true
  group by v.dia
),
-- Quitações de venda a prazo dentro do período, agrupadas pelo dia do
-- pagamento e pela venda (a proporção é por venda).
fiado_periodo as (
  select
    (p.pago_em at time zone p_tz)::date as dia,
    fv.id as fiado_id,
    sum(p.valor_pago) as pago,
    case
      when fv.valor_total > 0 then sum(p.valor_pago) / fv.valor_total
      else 0
    end as proporcao
  from public.fiado_pagamentos p
  join public.fiado_vendas fv on fv.id = p.venda_id
  where p.user_id = auth.uid()
    and fv.origem = 'gaveta'
    and p.pago_em >= p_from
    and p.pago_em <= p_to
  group by (p.pago_em at time zone p_tz)::date, fv.id, fv.valor_total
),
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
fiado_por_dia as (
  select
    f.dia,
    sum(f.pago) as recebido,
    sum(f.proporcao * coalesce(c.custo, 0)) as custo,
    sum(f.proporcao * coalesce(c.base, 0)) as base,
    sum(f.proporcao * coalesce(c.base_coberta, 0)) as base_coberta
  from fiado_periodo f
  left join custo_da_venda_fiado c on c.fiado_id = f.fiado_id
  group by f.dia
)
select
  d.dia,
  (coalesce(v.recebido, 0) + coalesce(f.recebido, 0))::numeric(12,2),
  coalesce(v.taxas, 0)::numeric(12,2),
  (coalesce(v.custo, 0) + coalesce(f.custo, 0))::numeric(12,2),
  (coalesce(v.base, 0) + coalesce(f.base, 0))::numeric(12,2),
  (coalesce(v.base_coberta, 0) + coalesce(f.base_coberta, 0))::numeric(12,2),
  coalesce(v.vendas, 0)::integer,
  coalesce(f.recebido, 0)::numeric(12,2)
from (
  select dia from vista_por_dia
  union
  select dia from fiado_por_dia
) d
left join vista_por_dia v on v.dia = d.dia
left join fiado_por_dia f on f.dia = d.dia
order by d.dia desc;
$$;

comment on function public.fechamento_por_dia(timestamptz, timestamptz, text) is
  'Fechamento Lucro x Custo quebrado por dia, mesmas regras da lucro_custo_summary: a soma dos dias fecha com o total do periodo.';

-- ---------- 2. fechamento_vendas_do_dia: o detalhe de um dia ----------
-- Carregada SOB DEMANDA, ao abrir o dia na tela: trazer as vendas de todos
-- os dias de um período de 30 dias seria pesado e quase sempre inútil.
--
-- Uma linha por ITEM — a tela agrupa por venda, e assim o custo de cada
-- item já vem junto, sem uma segunda ida ao banco.
--
-- Recebe as bordas do período junto do dia. Sem isso, um dia na borda
-- (parcialmente dentro do período) mostraria no detalhe vendas que não
-- entraram na linha do resumo.
--
-- `origem` separa a venda do dia ('caixa') da quitação de venda a prazo
-- antiga ('fiado'); nesta o valor é a parte paga no dia, e `vendida_em`
-- guarda a data da venda original.
create or replace function public.fechamento_vendas_do_dia(
  p_dia date,
  p_from timestamptz,
  p_to timestamptz,
  p_tz text default 'UTC'
)
returns table (
  sale_id      uuid,
  origem       text,
  vendida_em   timestamptz,
  metodo       text,
  taxa         numeric,
  item_id      uuid,
  nome         text,
  quantidade   numeric,
  valor        numeric,
  custo        numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
with vendas_vista as (
  select s.id, s.created_at, s.payment_method, s.fee_amount
  from public.sales s
  where s.user_id = auth.uid()
    and s.status = 'completed'
    and s.payment_method <> 'fiado'
    and s.created_at >= p_from
    and s.created_at <= p_to
    and (s.created_at at time zone p_tz)::date = p_dia
),
fiado_do_dia as (
  select
    fv.id as fiado_id,
    sum(p.valor_pago) as pago,
    case
      when fv.valor_total > 0 then sum(p.valor_pago) / fv.valor_total
      else 0
    end as proporcao
  from public.fiado_pagamentos p
  join public.fiado_vendas fv on fv.id = p.venda_id
  where p.user_id = auth.uid()
    and fv.origem = 'gaveta'
    and p.pago_em >= p_from
    and p.pago_em <= p_to
    and (p.pago_em at time zone p_tz)::date = p_dia
  group by fv.id, fv.valor_total
)
select
  v.id,
  'caixa'::text,
  v.created_at,
  v.payment_method,
  v.fee_amount::numeric(12,2),
  si.id,
  si.name_snapshot,
  si.quantity,
  si.line_total::numeric(12,2),
  (si.unit_cost * si.quantity)::numeric(12,2)
from vendas_vista v
join public.sale_items si on si.sale_id = v.id

union all

-- Da quitação, só a fração paga no dia entra — em valor e em custo.
select
  s.id,
  'fiado'::text,
  s.created_at,
  'fiado'::text,
  0::numeric(12,2),
  si.id,
  si.name_snapshot,
  si.quantity,
  (si.line_total * f.proporcao)::numeric(12,2),
  (si.unit_cost * si.quantity * f.proporcao)::numeric(12,2)
from fiado_do_dia f
join public.sales s
  on s.fiado_venda_id = f.fiado_id
 and s.user_id = auth.uid()
 and s.status = 'completed'
join public.sale_items si on si.sale_id = s.id;
$$;

comment on function public.fechamento_vendas_do_dia(date, timestamptz, timestamptz, text) is
  'Itens vendidos num dia com valor e custo, para o detalhe expansivel do fechamento; quitacao de fiado entra rateada pelo que foi pago.';
