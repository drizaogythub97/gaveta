-- =====================================================================
-- ERP Simples — Migração inicial
-- Modelo de dados + Row Level Security (isolamento total por usuário)
-- + função transacional de registro de venda.
-- Aplicar via Supabase SQL Editor ou CLI. Idempotência básica garantida.
-- =====================================================================

-- ---------- Extensões ----------
create extension if not exists "pgcrypto";  -- gen_random_uuid()

-- =====================================================================
-- TABELA: profiles  (espelha auth.users)
-- =====================================================================
create table if not exists public.profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  full_name            text,
  privacy_accepted_at  timestamptz,
  created_at           timestamptz not null default now()
);

-- =====================================================================
-- TABELA: products
-- =====================================================================
create table if not exists public.products (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null check (length(trim(name)) > 0),
  barcode         text,                                   -- OPCIONAL (nem todo produto é industrializado)
  price           numeric(12,2) not null default 0 check (price >= 0),
  track_stock     boolean not null default true,          -- false = sem controle de quantidade (ex.: marmitas)
  stock_quantity  numeric(12,3) check (stock_quantity is null or stock_quantity >= 0), -- pode ser nulo quando não controla estoque
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- coerência: se o produto controla estoque, precisa ter quantidade definida
  constraint products_stock_qty_when_tracked
    check (track_stock = false or stock_quantity is not null)
);
create index if not exists idx_products_user on public.products(user_id);
create index if not exists idx_products_user_name on public.products(user_id, lower(name));
-- código de barras único por usuário, apenas quando informado (índice parcial)
create unique index if not exists uniq_products_user_barcode
  on public.products(user_id, barcode) where barcode is not null;

-- =====================================================================
-- TABELA: sales
-- =====================================================================
create table if not exists public.sales (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  total       numeric(12,2) not null default 0 check (total >= 0),
  status      text not null default 'completed' check (status in ('completed','voided')),
  created_at  timestamptz not null default now()
);
create index if not exists idx_sales_user_date on public.sales(user_id, created_at);

-- =====================================================================
-- TABELA: sale_items
-- =====================================================================
create table if not exists public.sale_items (
  id             uuid primary key default gen_random_uuid(),
  sale_id        uuid not null references public.sales(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  product_id     uuid references public.products(id) on delete set null, -- null = item avulso
  name_snapshot  text not null,
  unit_price     numeric(12,2) not null check (unit_price >= 0),
  quantity       numeric(12,3) not null check (quantity > 0),
  line_total     numeric(12,2) not null check (line_total >= 0)
);
create index if not exists idx_sale_items_sale on public.sale_items(sale_id);
create index if not exists idx_sale_items_user on public.sale_items(user_id);

-- =====================================================================
-- ROW LEVEL SECURITY  (isolamento total por usuário)
-- =====================================================================
alter table public.profiles   enable row level security;
alter table public.products   enable row level security;
alter table public.sales      enable row level security;
alter table public.sale_items enable row level security;

-- profiles: dono = própria linha
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- products
create policy "products_select_own" on public.products for select using (auth.uid() = user_id);
create policy "products_insert_own" on public.products for insert with check (auth.uid() = user_id);
create policy "products_update_own" on public.products for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "products_delete_own" on public.products for delete using (auth.uid() = user_id);

-- sales
create policy "sales_select_own" on public.sales for select using (auth.uid() = user_id);
create policy "sales_insert_own" on public.sales for insert with check (auth.uid() = user_id);
create policy "sales_update_own" on public.sales for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "sales_delete_own" on public.sales for delete using (auth.uid() = user_id);

-- sale_items
create policy "sale_items_select_own" on public.sale_items for select using (auth.uid() = user_id);
create policy "sale_items_insert_own" on public.sale_items for insert with check (auth.uid() = user_id);
create policy "sale_items_update_own" on public.sale_items for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "sale_items_delete_own" on public.sale_items for delete using (auth.uid() = user_id);

-- =====================================================================
-- TRIGGER: criar profile automaticamente no signup
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, privacy_accepted_at)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    case when (new.raw_user_meta_data ->> 'privacy_accepted') = 'true'
         then now() else null end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- FUNÇÃO RPC: registrar venda (transação atômica)
-- items: jsonb array de { product_id (uuid|null), name, unit_price, quantity }
-- Cria a venda, insere itens, calcula total e baixa o estoque.
-- =====================================================================
create or replace function public.register_sale(items jsonb)
returns uuid
language plpgsql
security invoker  -- roda sob o RLS do usuário autenticado
as $$
declare
  v_user   uuid := auth.uid();
  v_sale   uuid;
  v_total  numeric(12,2) := 0;
  item     jsonb;
  v_qty    numeric(12,3);
  v_price  numeric(12,2);
  v_line   numeric(12,2);
  v_pid    uuid;
  v_name   text;
begin
  if v_user is null then
    raise exception 'Não autenticado';
  end if;
  if items is null or jsonb_array_length(items) = 0 then
    raise exception 'Venda sem itens';
  end if;

  insert into public.sales (user_id, total, status)
  values (v_user, 0, 'completed')
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

    -- baixa de estoque apenas para produto cadastrado, do próprio usuário,
    -- e que efetivamente controla quantidade (track_stock = true).
    -- Produtos sem controle de estoque (ex.: marmitas) são ignorados aqui.
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
