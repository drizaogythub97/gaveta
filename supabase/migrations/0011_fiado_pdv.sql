-- =====================================================================
-- ERP Simples — 0011: venda "a prazo" (Fiado) no PDV (Ecossistema F6, Fase 1)
--
-- ⚠️ Banco COMPARTILHADO com o FiadoApp. Esta migration é do lado do
-- GAVETA (tabelas public.sales / função register_sale, nossas), mas cria a
-- RPC-ponte que orquestra a venda a prazo chamando também a RPC do FiadoApp
-- (public.fiado_registrar_venda). Depende da migration 0009 do FiadoApp já
-- aplicada (colunas fiado_vendas.origem e ecossistema_prefs.fiado_pdv_ativo).
--
-- O que entra:
--   1. payment_method aceita 'fiado' (venda a prazo — dinheiro entra depois,
--      controlado no FiadoApp). Não vincula ao caixa (só 'dinheiro' vincula),
--      então não polui o fechamento nem, futuramente, o faturamento.
--   2. sales.fiado_venda_id: liga a venda do Gaveta ao a-receber no FiadoApp
--      (financeiro/link — Fase 2). Sem FK (evita acoplar o schema ao fiado_*).
--   3. register_sale passa a aceitar 'fiado' (1 linha no CHECK interno).
--   4. RPC-ponte registrar_venda_fiado: numa ÚNICA transação cria o
--      a-receber no FiadoApp e a venda no Gaveta (com baixa de estoque),
--      liga as duas e marca origem='gaveta'. Atômico → sem a-receber órfão.
-- =====================================================================

-- ---------- 1. CHECK do payment_method + coluna de vínculo ----------
alter table public.sales drop constraint if exists sales_payment_method_check;
alter table public.sales
  add constraint sales_payment_method_check
  check (payment_method in
    ('dinheiro','pix','debito','credito_avista','credito_parcelado','vale','fiado'));

alter table public.sales
  add column if not exists fiado_venda_id uuid;
create index if not exists idx_sales_fiado_venda
  on public.sales(user_id) where fiado_venda_id is not null;

-- ---------- 2. register_sale aceita 'fiado' ----------
-- (idêntica à 0010; muda só o CHECK do método para incluir 'fiado'. Venda
--  'fiado' não é 'dinheiro' → o vínculo com a sessão de caixa não ocorre.)
create or replace function public.register_sale(
  items jsonb,
  payment_method text default 'dinheiro',
  installments smallint default null,
  fee_amount numeric default 0,
  discount_amount numeric default 0
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user          uuid := auth.uid();
  v_sale          uuid;
  v_subtotal      numeric(12,2) := 0;
  v_total         numeric(12,2) := 0;
  v_discount      numeric(12,2);
  v_method        text;
  v_installments  smallint;
  v_fee           numeric(12,2);
  v_session       uuid;
  item            jsonb;
  v_qty           numeric(12,3);
  v_price         numeric(12,2);
  v_line          numeric(12,2);
  v_pid           uuid;
  v_name          text;
  v_track         boolean;
begin
  if v_user is null then
    raise exception 'Não autenticado';
  end if;
  if items is null or jsonb_array_length(items) = 0 then
    raise exception 'Venda sem itens';
  end if;

  v_method := coalesce(register_sale.payment_method, 'dinheiro');
  if v_method not in ('dinheiro','pix','debito','credito_avista','credito_parcelado','vale','fiado') then
    raise exception 'Forma de pagamento inválida: %', v_method;
  end if;

  v_installments := case
    when v_method = 'credito_parcelado' then coalesce(register_sale.installments, 2)
    else null
  end;
  if v_installments is not null and (v_installments < 1 or v_installments > 24) then
    raise exception 'Número de parcelas inválido: %', v_installments;
  end if;

  v_fee := round(greatest(coalesce(register_sale.fee_amount, 0), 0), 2);
  v_discount := round(greatest(coalesce(register_sale.discount_amount, 0), 0), 2);

  -- Vincula à sessão de caixa aberta apenas quando a venda é em dinheiro.
  if v_method = 'dinheiro' then
    select id into v_session
    from public.cash_sessions
    where user_id = v_user and status = 'open'
    limit 1;
  end if;

  insert into public.sales (user_id, total, status, payment_method, installments, fee_amount, discount_amount, cash_session_id)
  values (v_user, 0, 'completed', v_method, v_installments, v_fee, 0, v_session)
  returning id into v_sale;

  for item in select * from jsonb_array_elements(items)
  loop
    v_pid   := nullif(item ->> 'product_id','')::uuid;
    v_name  := coalesce(item ->> 'name', '');
    v_price := (item ->> 'unit_price')::numeric;
    v_qty   := (item ->> 'quantity')::numeric;

    if v_qty <= 0 or v_price < 0 then
      raise exception 'Item inválido: %', v_name;
    end if;

    -- Produto referenciado precisa existir E ser do próprio usuário
    -- (a FK sozinha não garante isso, pois não passa pela RLS).
    v_track := null;
    if v_pid is not null then
      select track_stock into v_track
      from public.products
      where id = v_pid and user_id = v_user;

      if v_track is null then
        raise exception 'Produto não encontrado';
      end if;
    end if;

    v_line     := round(v_price * v_qty, 2);
    v_subtotal := v_subtotal + v_line;

    insert into public.sale_items
      (sale_id, user_id, product_id, name_snapshot, unit_price, quantity, line_total)
    values
      (v_sale, v_user, v_pid, v_name, v_price, v_qty, v_line);

    if v_pid is not null and v_track then
      update public.products
        set stock_quantity = greatest(coalesce(stock_quantity, 0) - v_qty, 0),
            updated_at = now()
      where id = v_pid and user_id = v_user;

      insert into public.stock_movements (user_id, product_id, type, quantity, sale_id)
      values (v_user, v_pid, 'sale', -v_qty, v_sale);
    end if;
  end loop;

  if v_discount > v_subtotal then
    raise exception 'Desconto maior que o subtotal';
  end if;

  v_total := round(v_subtotal - v_discount, 2);

  update public.sales
    set total = v_total, discount_amount = v_discount
  where id = v_sale;

  return v_sale;
end;
$$;

-- ---------- 3. RPC-ponte: venda a prazo no PDV ----------
-- p_items        : itens no formato do Gaveta (register_sale)
-- p_itens_fiado  : MESMOS itens no formato do FiadoApp, já formatados pelo
--                  servidor (qtd fracionada embutida na descrição, valor da
--                  linha como unitário) — decisão do dono (F6 Fase 1).
-- Cliente: existente (p_cliente_id) OU novo inline (p_cliente jsonb).
create or replace function public.registrar_venda_fiado(
  p_items jsonb,
  p_itens_fiado jsonb,
  p_cliente_id uuid default null,
  p_cliente jsonb default null,
  p_data_vencimento date default null,
  p_observacao text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user   uuid := auth.uid();
  v_ativo  boolean;
  v_venda  uuid;
  v_sale   uuid;
  v_tot_f  numeric(12,2);
  v_tot_g  numeric(12,2);
begin
  if v_user is null then
    raise exception 'Não autenticado';
  end if;

  -- Guarda de servidor: a ponte é opt-in, precisa estar ligada.
  select fiado_pdv_ativo into v_ativo
  from public.ecossistema_prefs
  where user_id = v_user;
  if not coalesce(v_ativo, false) then
    raise exception 'Integração com o FiadoApp desativada';
  end if;

  -- 1) a-receber no FiadoApp (cria/atualiza cliente inline). Vencimento
  --    default +30 dias (convenção do FiadoApp) quando não informado.
  v_venda := public.fiado_registrar_venda(
    p_itens_fiado,
    p_cliente_id,
    p_cliente,
    current_date,
    coalesce(p_data_vencimento, current_date + 30),
    p_observacao
  );
  update public.fiado_vendas set origem = 'gaveta' where id = v_venda;

  -- 2) venda no Gaveta (baixa estoque; 'fiado' não vincula ao caixa).
  v_sale := public.register_sale(p_items, 'fiado', null, 0, 0);
  update public.sales set fiado_venda_id = v_venda where id = v_sale;

  -- Defesa em profundidade: os dois lados têm que somar o MESMO total,
  -- senão o a-receber e a venda do caixa divergiriam.
  select valor_total into v_tot_f from public.fiado_vendas where id = v_venda;
  select total       into v_tot_g from public.sales        where id = v_sale;
  if v_tot_f is distinct from v_tot_g then
    raise exception 'Divergência no total da venda a prazo';
  end if;

  return jsonb_build_object('venda_id', v_venda, 'sale_id', v_sale);
end;
$$;
