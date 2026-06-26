-- =====================================================================
-- ERP Simples — 0006: caixa e estoque v2 (Fase D)
--
-- 1. sales.discount_amount: desconto no total da venda (snapshot).
-- 2. stock_movements: histórico de movimentação de estoque
--    (venda/estorno/reposição/ajuste), com RLS por user_id.
-- 3. register_sale: passa a receber discount_amount, aplica no total e
--    registra a saída de estoque em stock_movements.
-- 4. set_sale_status: RPC transacional que estorna/reativa uma venda
--    devolvendo ou rebaixando o estoque dos itens (track_stock = true)
--    e registrando o movimento correspondente.
-- 5. adjust_stock: RPC transacional para reposição/ajuste manual de
--    estoque (chamada por estoque/actions.ts), registrando o movimento.
--
-- Tudo aditivo e compatível com chamadas existentes (defaults preservados).
-- =====================================================================

-- ---------- sales: desconto no total ----------
alter table public.sales
  add column if not exists discount_amount numeric(12,2) not null default 0
    check (discount_amount >= 0);

-- ---------- stock_movements: histórico de movimentação ----------
-- quantity = variação (com sinal) aplicada ao estoque do produto:
--   venda            -> negativa (saída)
--   estorno          -> positiva (entrada / devolução)
--   reposição        -> positiva (entrada)
--   ajuste (set)     -> diferença com sinal (entra ou sai)
create table if not exists public.stock_movements (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  product_id  uuid not null references public.products(id) on delete cascade,
  type        text not null check (type in ('sale','void','restock','adjust')),
  quantity    numeric(12,3) not null,
  sale_id     uuid references public.sales(id) on delete set null,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_stock_movements_user_date
  on public.stock_movements(user_id, created_at desc);
create index if not exists idx_stock_movements_product
  on public.stock_movements(product_id, created_at desc);

alter table public.stock_movements enable row level security;

-- Inserts feitos por funções security invoker (sob o RLS do usuário) ou pelo
-- app; leitura e escrita restritas ao dono. Sem update/delete (histórico).
create policy "stock_movements_select_own"
  on public.stock_movements for select using (auth.uid() = user_id);
create policy "stock_movements_insert_own"
  on public.stock_movements for insert with check (auth.uid() = user_id);

-- ---------- RPC register_sale: desconto + movimentos de estoque ----------
drop function if exists public.register_sale(jsonb, text, smallint, numeric);

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

  -- Cria a venda; total/desconto ajustados ao fim (precisa do subtotal).
  insert into public.sales (user_id, total, status, payment_method, installments, fee_amount, discount_amount)
  values (v_user, 0, 'completed', v_method, v_installments, v_fee, 0)
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

    -- Baixa de estoque apenas para produto cadastrado, do próprio usuário,
    -- e que efetivamente controla quantidade (track_stock = true).
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

  -- Desconto não pode passar do subtotal.
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

-- ---------- RPC set_sale_status: estorno/reativação com estoque ----------
-- Inverte o status da venda de forma transacional. Ao estornar, devolve o
-- estoque dos itens (track_stock = true); ao reativar, baixa de novo. Cada
-- ação registra um movimento. Idempotente: se já estiver no status alvo,
-- não faz nada.
create or replace function public.set_sale_status(
  p_sale_id uuid,
  p_status text
)
returns void
language plpgsql
security invoker
as $$
declare
  v_user     uuid := auth.uid();
  v_current  text;
  rec        record;
begin
  if v_user is null then
    raise exception 'Não autenticado';
  end if;
  if p_status not in ('completed','voided') then
    raise exception 'Status inválido: %', p_status;
  end if;

  -- Trava a venda do próprio usuário para evitar duplo clique concorrente.
  select status into v_current
  from public.sales
  where id = p_sale_id and user_id = v_user
  for update;

  if v_current is null then
    raise exception 'Venda não encontrada';
  end if;
  if v_current = p_status then
    return; -- nada a fazer
  end if;

  for rec in
    select si.product_id, si.quantity
    from public.sale_items si
    join public.products p
      on p.id = si.product_id and p.user_id = v_user
    where si.sale_id = p_sale_id
      and si.product_id is not null
      and p.track_stock = true
  loop
    if p_status = 'voided' then
      -- Estorno: devolve a quantidade ao estoque.
      update public.products
        set stock_quantity = coalesce(stock_quantity, 0) + rec.quantity,
            updated_at = now()
      where id = rec.product_id and user_id = v_user;

      insert into public.stock_movements (user_id, product_id, type, quantity, sale_id)
      values (v_user, rec.product_id, 'void', rec.quantity, p_sale_id);
    else
      -- Reativação: baixa o estoque de novo.
      update public.products
        set stock_quantity = greatest(coalesce(stock_quantity, 0) - rec.quantity, 0),
            updated_at = now()
      where id = rec.product_id and user_id = v_user;

      insert into public.stock_movements (user_id, product_id, type, quantity, sale_id)
      values (v_user, rec.product_id, 'sale', -rec.quantity, p_sale_id);
    end if;
  end loop;

  update public.sales
    set status = p_status
  where id = p_sale_id and user_id = v_user;
end;
$$;

-- ---------- RPC adjust_stock: reposição/ajuste manual ----------
-- mode = 'add' (reposição, entrada) ou 'set' (ajuste para um valor exato).
-- Registra o movimento com a variação resultante. Retorna o novo estoque.
create or replace function public.adjust_stock(
  p_product_id uuid,
  p_mode text,
  p_quantity numeric
)
returns numeric
language plpgsql
security invoker
as $$
declare
  v_user     uuid := auth.uid();
  v_track    boolean;
  v_current  numeric(12,3);
  v_new      numeric(12,3);
  v_delta    numeric(12,3);
begin
  if v_user is null then
    raise exception 'Não autenticado';
  end if;
  if p_mode not in ('set','add') then
    raise exception 'Modo inválido: %', p_mode;
  end if;
  if p_quantity is null or p_quantity < 0 then
    raise exception 'Quantidade inválida';
  end if;

  select track_stock, stock_quantity into v_track, v_current
  from public.products
  where id = p_product_id and user_id = v_user
  for update;

  if v_track is null then
    raise exception 'Produto não encontrado';
  end if;
  if v_track = false then
    raise exception 'Produto não controla estoque';
  end if;

  v_current := coalesce(v_current, 0);
  v_new := case when p_mode = 'set'
                then round(p_quantity, 3)
                else round(v_current + p_quantity, 3)
           end;
  v_delta := round(v_new - v_current, 3);

  update public.products
    set stock_quantity = v_new, updated_at = now()
  where id = p_product_id and user_id = v_user;

  if v_delta <> 0 then
    insert into public.stock_movements (user_id, product_id, type, quantity)
    values (v_user, p_product_id, case when p_mode = 'add' then 'restock' else 'adjust' end, v_delta);
  end if;

  return v_new;
end;
$$;
