-- =====================================================================
-- ERP Simples — 0004: preferências do usuário + taxas por método +
-- ajustes em sales para parcelamento e snapshot de taxa.
--
-- - profiles ganha brand_name, brand_logo_path e theme.
-- - Nova tabela preferences_fees (1:1 com usuário), guardando as
--   porcentagens por método de pagamento. Default 0 em tudo.
-- - sales: split do método 'credito' em 'credito_avista' e
--   'credito_parcelado'; novas colunas installments + fee_amount
--   (snapshot da taxa aplicada NO MOMENTO da venda).
-- - register_sale RPC atualizada para receber installments e
--   fee_amount.
-- =====================================================================

-- ---------- profiles: preferências de marca/tema ----------
alter table public.profiles
  add column if not exists brand_name text,
  add column if not exists brand_logo_path text,
  add column if not exists theme text not null default 'light'
    check (theme in ('light','dark'));

-- ---------- preferences_fees: porcentagens por método ----------
create table if not exists public.preferences_fees (
  user_id                              uuid primary key references auth.users(id) on delete cascade,
  pix_pct                              numeric(5,2) not null default 0 check (pix_pct >= 0 and pix_pct <= 100),
  debito_pct                           numeric(5,2) not null default 0 check (debito_pct >= 0 and debito_pct <= 100),
  credito_avista_pct                   numeric(5,2) not null default 0 check (credito_avista_pct >= 0 and credito_avista_pct <= 100),
  credito_parcelado_base_pct           numeric(5,2) not null default 0 check (credito_parcelado_base_pct >= 0 and credito_parcelado_base_pct <= 100),
  credito_parcelado_por_parcela_pct    numeric(5,2) not null default 0 check (credito_parcelado_por_parcela_pct >= 0 and credito_parcelado_por_parcela_pct <= 100),
  vale_pct                             numeric(5,2) not null default 0 check (vale_pct >= 0 and vale_pct <= 100),
  updated_at                           timestamptz  not null default now()
);

alter table public.preferences_fees enable row level security;

create policy "preferences_fees_select_own"
  on public.preferences_fees for select using (auth.uid() = user_id);
create policy "preferences_fees_insert_own"
  on public.preferences_fees for insert with check (auth.uid() = user_id);
create policy "preferences_fees_update_own"
  on public.preferences_fees for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- sales: parcelamento + snapshot de taxa ----------
-- Atualiza CHECK do payment_method para splitar credito em a vista/parcelado.
alter table public.sales drop constraint if exists sales_payment_method_check;
update public.sales set payment_method = 'credito_avista' where payment_method = 'credito';
alter table public.sales
  add constraint sales_payment_method_check
  check (payment_method in ('dinheiro','pix','debito','credito_avista','credito_parcelado','vale'));

alter table public.sales
  add column if not exists installments smallint
    check (installments is null or (installments >= 1 and installments <= 24)),
  add column if not exists fee_amount numeric(12,2) not null default 0
    check (fee_amount >= 0);

-- ---------- RPC register_sale: recebe installments + fee_amount ----------
drop function if exists public.register_sale(jsonb, text);

create or replace function public.register_sale(
  items jsonb,
  payment_method text default 'dinheiro',
  installments smallint default null,
  fee_amount numeric default 0
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_user          uuid := auth.uid();
  v_sale          uuid;
  v_total         numeric(12,2) := 0;
  v_method        text;
  v_installments  smallint;
  v_fee           numeric(12,2);
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

  insert into public.sales (user_id, total, status, payment_method, installments, fee_amount)
  values (v_user, 0, 'completed', v_method, v_installments, v_fee)
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

    v_line  := round(v_price * v_qty, 2);
    v_total := v_total + v_line;

    insert into public.sale_items
      (sale_id, user_id, product_id, name_snapshot, unit_price, quantity, line_total)
    values
      (v_sale, v_user, v_pid, v_name, v_price, v_qty, v_line);

    -- Baixa de estoque apenas para produto cadastrado, do próprio usuário,
    -- e que efetivamente controla quantidade (track_stock = true).
    if v_pid is not null then
      update public.products
        set stock_quantity = greatest(coalesce(stock_quantity, 0) - v_qty, 0),
            updated_at = now()
      where id = v_pid and user_id = v_user and track_stock = true;
    end if;
  end loop;

  update public.sales set total = v_total where id = v_sale;
  return v_sale;
end;
$$;
