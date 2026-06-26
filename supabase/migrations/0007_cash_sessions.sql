-- =====================================================================
-- ERP Simples — 0007: fechamento de caixa (Fase E)
--
-- 1. cash_sessions: sessão de caixa (abertura com troco, fechamento com
--    conferência esperado × contado). No máximo UMA sessão aberta por
--    usuário (índice parcial único).
-- 2. cash_movements: sangria (retirada) e suprimento (reforço) da sessão.
-- 3. sales.cash_session_id: vincula vendas em dinheiro à sessão aberta.
-- 4. RPCs transacionais open_cash_session / add_cash_movement /
--    close_cash_session, e register_sale passa a vincular vendas em
--    dinheiro à sessão aberta (sem mudar a assinatura).
--
-- Tudo aditivo e compatível com a main (register_sale mantém os 5 args).
-- RLS por user_id desde já.
-- =====================================================================

-- ---------- cash_sessions ----------
create table if not exists public.cash_sessions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  opened_at         timestamptz not null default now(),
  opening_amount    numeric(12,2) not null default 0 check (opening_amount >= 0),
  closed_at         timestamptz,
  counted_amount    numeric(12,2) check (counted_amount is null or counted_amount >= 0),
  expected_amount   numeric(12,2),
  difference_amount numeric(12,2),
  status            text not null default 'open' check (status in ('open','closed')),
  opening_note      text,
  closing_note      text
);
-- No máximo uma sessão ABERTA por usuário.
create unique index if not exists uniq_one_open_cash_session_per_user
  on public.cash_sessions(user_id) where status = 'open';
create index if not exists idx_cash_sessions_user_date
  on public.cash_sessions(user_id, opened_at desc);

alter table public.cash_sessions enable row level security;
create policy "cash_sessions_select_own"
  on public.cash_sessions for select using (auth.uid() = user_id);
create policy "cash_sessions_insert_own"
  on public.cash_sessions for insert with check (auth.uid() = user_id);
create policy "cash_sessions_update_own"
  on public.cash_sessions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- cash_movements (sangria/suprimento) ----------
create table if not exists public.cash_movements (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  session_id  uuid not null references public.cash_sessions(id) on delete cascade,
  type        text not null check (type in ('sangria','suprimento')),
  amount      numeric(12,2) not null check (amount > 0),
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_cash_movements_session
  on public.cash_movements(session_id, created_at);

alter table public.cash_movements enable row level security;
create policy "cash_movements_select_own"
  on public.cash_movements for select using (auth.uid() = user_id);
create policy "cash_movements_insert_own"
  on public.cash_movements for insert with check (auth.uid() = user_id);

-- ---------- sales: vínculo com a sessão de caixa ----------
alter table public.sales
  add column if not exists cash_session_id uuid references public.cash_sessions(id) on delete set null;
create index if not exists idx_sales_cash_session
  on public.sales(cash_session_id) where cash_session_id is not null;

-- ---------- RPC open_cash_session ----------
create or replace function public.open_cash_session(
  p_opening numeric default 0,
  p_note text default null
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_user uuid := auth.uid();
  v_id   uuid;
begin
  if v_user is null then
    raise exception 'Não autenticado';
  end if;
  if p_opening is null or p_opening < 0 then
    raise exception 'Troco inicial inválido';
  end if;
  if exists (select 1 from public.cash_sessions where user_id = v_user and status = 'open') then
    raise exception 'Já existe um caixa aberto';
  end if;

  insert into public.cash_sessions (user_id, opening_amount, opening_note)
  values (v_user, round(p_opening, 2), nullif(btrim(p_note), ''))
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------- RPC add_cash_movement (sangria/suprimento) ----------
create or replace function public.add_cash_movement(
  p_type text,
  p_amount numeric,
  p_note text default null
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_user    uuid := auth.uid();
  v_session uuid;
  v_id      uuid;
begin
  if v_user is null then
    raise exception 'Não autenticado';
  end if;
  if p_type not in ('sangria','suprimento') then
    raise exception 'Tipo de movimento inválido';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Valor inválido';
  end if;

  select id into v_session
  from public.cash_sessions
  where user_id = v_user and status = 'open'
  for update;

  if v_session is null then
    raise exception 'Nenhum caixa aberto';
  end if;

  insert into public.cash_movements (user_id, session_id, type, amount, note)
  values (v_user, v_session, p_type, round(p_amount, 2), nullif(btrim(p_note), ''))
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------- RPC close_cash_session ----------
-- Calcula o esperado em caixa = troco inicial + vendas em dinheiro concluídas
-- (vinculadas à sessão) + suprimentos − sangrias. Grava esperado, contado e a
-- diferença, e fecha a sessão.
create or replace function public.close_cash_session(
  p_counted numeric,
  p_note text default null
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_user      uuid := auth.uid();
  v_session   public.cash_sessions%rowtype;
  v_sales     numeric(12,2);
  v_supr      numeric(12,2);
  v_sang      numeric(12,2);
  v_expected  numeric(12,2);
begin
  if v_user is null then
    raise exception 'Não autenticado';
  end if;
  if p_counted is null or p_counted < 0 then
    raise exception 'Valor contado inválido';
  end if;

  select * into v_session
  from public.cash_sessions
  where user_id = v_user and status = 'open'
  for update;

  if v_session.id is null then
    raise exception 'Nenhum caixa aberto';
  end if;

  select coalesce(sum(total), 0) into v_sales
  from public.sales
  where user_id = v_user
    and cash_session_id = v_session.id
    and payment_method = 'dinheiro'
    and status = 'completed';

  select coalesce(sum(amount), 0) into v_supr
  from public.cash_movements
  where session_id = v_session.id and type = 'suprimento';

  select coalesce(sum(amount), 0) into v_sang
  from public.cash_movements
  where session_id = v_session.id and type = 'sangria';

  v_expected := round(v_session.opening_amount + v_sales + v_supr - v_sang, 2);

  update public.cash_sessions
    set closed_at = now(),
        counted_amount = round(p_counted, 2),
        expected_amount = v_expected,
        difference_amount = round(p_counted - v_expected, 2),
        closing_note = nullif(btrim(p_note), ''),
        status = 'closed'
  where id = v_session.id;

  return v_session.id;
end;
$$;

-- ---------- RPC register_sale: vincula venda em dinheiro à sessão aberta ----------
drop function if exists public.register_sale(jsonb, text, smallint, numeric, numeric);

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
begin
  if v_user is null then
    raise exception 'Não autenticado';
  end if;
  if items is null or jsonb_array_length(items) = 0 then
    raise exception 'Venda sem itens';
  end if;

  v_method := coalesce(register_sale.payment_method, 'dinheiro');
  if v_method not in ('dinheiro','pix','debito','credito_avista','credito_parcelado','vale') then
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

    v_line     := round(v_price * v_qty, 2);
    v_subtotal := v_subtotal + v_line;

    insert into public.sale_items
      (sale_id, user_id, product_id, name_snapshot, unit_price, quantity, line_total)
    values
      (v_sale, v_user, v_pid, v_name, v_price, v_qty, v_line);

    if v_pid is not null then
      update public.products
        set stock_quantity = greatest(coalesce(stock_quantity, 0) - v_qty, 0),
            updated_at = now()
      where id = v_pid and user_id = v_user and track_stock = true;

      if found then
        insert into public.stock_movements (user_id, product_id, type, quantity, sale_id)
        values (v_user, v_pid, 'sale', -v_qty, v_sale);
      end if;
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
