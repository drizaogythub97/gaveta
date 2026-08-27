-- =====================================================================
-- ERP Simples — 0013: fundação de custo (plano 08, fase G1)
--
-- ⚠️ Banco COMPARTILHADO com o FiadoApp. Esta migration é 100% do lado do
-- GAVETA (public.products / public.sale_items / register_sale). NADA em
-- fiado_* é tocado — a RPC-ponte registrar_venda_fiado já chama
-- register_sale, então o snapshot de custo passa a valer também para a
-- venda a prazo, sem nenhuma alteração na ponte.
--
-- O que entra (tudo ADITIVO — colunas novas, opcionais):
--   1. products.cost_price: quanto o produto CUSTA para o dono. Método
--      "último custo" (decisão 3 do doc 08): a coluna sempre guarda o custo
--      da compra mais recente (por ora só edição manual; a fase G2 passa a
--      preenchê-la pela nota de compra).
--   2. sale_items.unit_cost: SNAPSHOT do cost_price no instante da venda.
--      É o que garante que o lucro histórico não mude quando o custo do
--      produto mudar. Item avulso (sem product_id) ou produto sem custo
--      cadastrado → null (a fase G3 sinaliza esses itens como "sem custo").
--   3. register_sale grava o snapshot em cada item vendido.
--
-- RLS: as duas tabelas já têm RLS habilitado com políticas por user_id
-- (migration 0001) — colunas novas herdam a proteção; nada a mudar.
-- =====================================================================

-- ---------- 1. products.cost_price (último custo) ----------
alter table public.products
  add column if not exists cost_price numeric(12,2);

alter table public.products
  drop constraint if exists products_cost_price_non_negative;
alter table public.products
  add constraint products_cost_price_non_negative
  check (cost_price is null or cost_price >= 0);

comment on column public.products.cost_price is
  'Preço de custo do produto (último custo pago). Null = custo não informado.';

-- ---------- 2. sale_items.unit_cost (snapshot na venda) ----------
alter table public.sale_items
  add column if not exists unit_cost numeric(12,2);

alter table public.sale_items
  drop constraint if exists sale_items_unit_cost_non_negative;
alter table public.sale_items
  add constraint sale_items_unit_cost_non_negative
  check (unit_cost is null or unit_cost >= 0);

comment on column public.sale_items.unit_cost is
  'Snapshot do products.cost_price no momento da venda. Null = item avulso '
  'ou produto sem custo cadastrado.';

-- ---------- 3. register_sale grava o snapshot de custo ----------
-- (idêntica à 0011; mudam só as linhas marcadas com "custo (G1)".)
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
  v_cost          numeric(12,2);  -- custo (G1)
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
    v_cost  := null;  -- custo (G1): zera a cada item; item avulso fica null
    if v_pid is not null then
      -- custo (G1): lê o custo junto do track_stock (mesma ida ao banco).
      select track_stock, cost_price into v_track, v_cost
      from public.products
      where id = v_pid and user_id = v_user;

      if v_track is null then
        raise exception 'Produto não encontrado';
      end if;
    end if;

    v_line     := round(v_price * v_qty, 2);
    v_subtotal := v_subtotal + v_line;

    insert into public.sale_items
      (sale_id, user_id, product_id, name_snapshot, unit_price, quantity, line_total, unit_cost)
    values
      (v_sale, v_user, v_pid, v_name, v_price, v_qty, v_line, v_cost);

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
