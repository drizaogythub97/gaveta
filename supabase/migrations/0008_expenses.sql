-- =====================================================================
-- ERP Simples — 0008: despesas (Fase F)
--
-- Tabela expenses (entradas de saída de dinheiro), com categorias fixas.
-- Despesas e estoque são SEPARADOS na v1 (sem vínculo). RLS por user_id.
-- =====================================================================

create table if not exists public.expenses (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  incurred_on  date not null default current_date,
  category     text not null check (category in
                 ('insumos','salarios','aluguel','contas','impostos','outros')),
  amount       numeric(12,2) not null check (amount > 0),
  description  text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_expenses_user_date
  on public.expenses(user_id, incurred_on desc);

alter table public.expenses enable row level security;

create policy "expenses_select_own"
  on public.expenses for select using (auth.uid() = user_id);
create policy "expenses_insert_own"
  on public.expenses for insert with check (auth.uid() = user_id);
create policy "expenses_update_own"
  on public.expenses for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "expenses_delete_own"
  on public.expenses for delete using (auth.uid() = user_id);
