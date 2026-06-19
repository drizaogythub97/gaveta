-- =====================================================================
-- ERP Simples — 0003: múltiplos códigos de barras por produto
-- - Cria a tabela product_barcodes (1 produto → N códigos).
-- - Faz backfill dos products.barcode existentes.
-- - Remove a coluna barcode antiga de products.
-- - RLS por user_id em product_barcodes (mesma política dos demais).
-- =====================================================================

create table if not exists public.product_barcodes (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  barcode     text not null check (length(trim(barcode)) > 0),
  created_at  timestamptz not null default now()
);

create index if not exists idx_product_barcodes_product
  on public.product_barcodes(product_id);

create unique index if not exists uniq_product_barcodes_user_barcode
  on public.product_barcodes(user_id, barcode);

alter table public.product_barcodes enable row level security;

create policy "product_barcodes_select_own"
  on public.product_barcodes for select using (auth.uid() = user_id);
create policy "product_barcodes_insert_own"
  on public.product_barcodes for insert with check (auth.uid() = user_id);
create policy "product_barcodes_update_own"
  on public.product_barcodes for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "product_barcodes_delete_own"
  on public.product_barcodes for delete using (auth.uid() = user_id);

-- ---------- Backfill ----------
insert into public.product_barcodes (product_id, user_id, barcode)
select id, user_id, trim(barcode)
  from public.products
 where barcode is not null and length(trim(barcode)) > 0
on conflict do nothing;

-- ---------- Drop coluna antiga ----------
drop index if exists public.uniq_products_user_barcode;
alter table public.products drop column if exists barcode;
