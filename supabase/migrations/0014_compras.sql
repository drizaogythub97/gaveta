-- =====================================================================
-- ERP Simples — 0014: núcleo de compras / entrada por nota (plano 08, G2a)
--
-- ⚠️ Banco COMPARTILHADO com o FiadoApp. Tudo aqui é do lado do GAVETA
-- (public.purchases / public.purchase_items / public.stock_movements /
-- public.products / public.expenses). NADA em fiado_* é tocado.
--
-- O que entra (tudo ADITIVO):
--   1. purchases: a nota de compra lançada (fornecedor, data, chave de
--      acesso quando houver, total, origem). Índice único parcial por
--      (user_id, access_key) bloqueia lançar a MESMA nota duas vezes.
--   2. purchase_items: os itens da nota, com o custo unitário daquela
--      compra preservado (histórico que permitiria, no futuro, migrar do
--      "último custo" para médio ponderado sem perda — ver 1.3 do plano).
--   3. stock_movements ganha o tipo 'purchase' (entrada por nota).
--   4. RPC registrar_compra: numa ÚNICA transação cria a nota, os itens,
--      entra o estoque, atualiza o ÚLTIMO CUSTO dos produtos (decisão 3),
--      cria os produtos novos (com código de barras) e lança o gasto
--      automático em 'insumos' (decisão 4). Qualquer erro → nada grava.
--
-- Padrão da RPC seguindo registrar_venda_fiado (0011): security invoker
-- (roda sob a RLS do usuário), search_path fixado, tudo schema-qualificado.
--
-- RLS: as duas tabelas novas nascem com RLS habilitado e políticas por
-- user_id. Só SELECT e INSERT — nesta fase a nota lançada é histórico
-- imutável (sem edição/exclusão), mesma escolha de stock_movements. Por
-- isso a RPC soma o total ANTES de inserir a nota (não há UPDATE possível).
-- =====================================================================

-- ---------- 1. purchases (a nota) ----------
create table if not exists public.purchases (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  supplier_name  text,                       -- opcional (nem toda nota tem)
  access_key     text,                       -- chave da NF-e: 44 dígitos
  issued_on      date not null default current_date,
  total          numeric(12,2) not null default 0 check (total >= 0),
  source         text not null default 'manual'
                   check (source in ('manual','pdf','foto','xml')),
  created_at     timestamptz not null default now(),
  constraint purchases_access_key_format
    check (access_key is null or access_key ~ '^[0-9]{44}$')
);
create index if not exists idx_purchases_user_date
  on public.purchases(user_id, issued_on desc);
-- Mesma nota não entra duas vezes (só vale quando a chave foi informada).
create unique index if not exists uniq_purchases_user_access_key
  on public.purchases(user_id, access_key) where access_key is not null;

comment on table public.purchases is
  'Nota de compra lançada (entrada de mercadoria). Histórico imutável.';
comment on column public.purchases.source is
  'Como a nota entrou: manual (G2a) ou pdf/foto/xml (extração, G2b).';

-- ---------- 2. purchase_items (os itens da nota) ----------
create table if not exists public.purchase_items (
  id                    uuid primary key default gen_random_uuid(),
  purchase_id           uuid not null references public.purchases(id) on delete cascade,
  user_id               uuid not null references auth.users(id) on delete cascade,
  product_id            uuid references public.products(id) on delete set null,
  description_snapshot  text not null check (length(trim(description_snapshot)) > 0),
  barcode               text,
  quantity              numeric(12,3) not null check (quantity > 0),
  unit_cost             numeric(12,2) not null check (unit_cost >= 0),
  line_total            numeric(12,2) not null check (line_total >= 0)
);
create index if not exists idx_purchase_items_purchase
  on public.purchase_items(purchase_id);
create index if not exists idx_purchase_items_user
  on public.purchase_items(user_id);
create index if not exists idx_purchase_items_product
  on public.purchase_items(product_id) where product_id is not null;

comment on column public.purchase_items.product_id is
  'Produto do Gaveta que este item alimentou. Null = item ainda não vinculado.';
comment on column public.purchase_items.unit_cost is
  'Custo unitário NESTA compra (histórico — products.cost_price guarda o último).';

-- ---------- 3. RLS (isolamento por usuário) ----------
alter table public.purchases      enable row level security;
alter table public.purchase_items enable row level security;

create policy "purchases_select_own"
  on public.purchases for select using (auth.uid() = user_id);
create policy "purchases_insert_own"
  on public.purchases for insert with check (auth.uid() = user_id);

create policy "purchase_items_select_own"
  on public.purchase_items for select using (auth.uid() = user_id);
create policy "purchase_items_insert_own"
  on public.purchase_items for insert with check (auth.uid() = user_id);

-- ---------- 4. stock_movements: tipo 'purchase' ----------
alter table public.stock_movements drop constraint if exists stock_movements_type_check;
alter table public.stock_movements
  add constraint stock_movements_type_check
  check (type in ('sale','void','restock','adjust','purchase'));

-- ---------- 5. RPC registrar_compra (transação única) ----------
-- p_purchase : { supplier_name, access_key, issued_on, source }
-- p_itens    : array de itens. Cada item é uma destas formas:
--   a) produto existente : { product_id, description, barcode?, quantity, unit_cost }
--   b) produto novo      : { is_new: true, description, barcode?, quantity,
--                            unit_cost, sale_price, track_stock? }
--   c) sem vínculo       : { description, quantity, unit_cost }  (registra a
--      linha da nota sem mexer em estoque/custo — item não identificado)
--
-- O total da nota é SOMADO a partir dos itens (não vem do cliente): assim o
-- valor lançado em gastos é sempre igual ao que entrou no estoque.
create or replace function public.registrar_compra(
  p_purchase jsonb,
  p_itens jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user          uuid := auth.uid();
  v_purchase      uuid;
  v_supplier      text;
  v_key           text;
  v_issued        date;
  v_source        text;
  v_total         numeric(12,2) := 0;
  v_expense       uuid;
  v_novos         integer := 0;
  v_atualizados   integer := 0;
  v_nota          text;
  item            jsonb;
  v_pid           uuid;
  v_is_new        boolean;
  v_desc          text;
  v_barcode       text;
  v_qty           numeric(12,3);
  v_cost          numeric(12,2);
  v_line          numeric(12,2);
  v_price         numeric(12,2);
  v_track         boolean;
begin
  if v_user is null then
    raise exception 'Não autenticado';
  end if;
  if p_itens is null or jsonb_array_length(p_itens) = 0 then
    raise exception 'Nota sem itens';
  end if;

  v_supplier := nullif(btrim(coalesce(p_purchase ->> 'supplier_name', '')), '');
  v_key      := nullif(btrim(coalesce(p_purchase ->> 'access_key', '')), '');
  v_issued   := coalesce(nullif(p_purchase ->> 'issued_on', '')::date, current_date);
  v_source   := coalesce(nullif(p_purchase ->> 'source', ''), 'manual');

  if v_source not in ('manual','pdf','foto','xml') then
    raise exception 'Origem da nota inválida: %', v_source;
  end if;
  if v_key is not null and v_key !~ '^[0-9]{44}$' then
    raise exception 'Chave de acesso inválida';
  end if;
  if v_issued > current_date then
    raise exception 'Data da compra no futuro';
  end if;

  -- 1ª passada: valida cada item e soma o total da nota. Como purchases é
  -- histórico imutável (sem política de UPDATE), o total precisa estar
  -- pronto na hora do insert.
  for item in select * from jsonb_array_elements(p_itens)
  loop
    v_desc := btrim(coalesce(item ->> 'description', ''));
    v_qty  := (item ->> 'quantity')::numeric;
    v_cost := round((item ->> 'unit_cost')::numeric, 2);

    if v_desc = '' then
      raise exception 'Item sem descrição';
    end if;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Quantidade inválida no item: %', v_desc;
    end if;
    if v_cost is null or v_cost < 0 then
      raise exception 'Custo inválido no item: %', v_desc;
    end if;

    v_total := v_total + round(v_cost * v_qty, 2);
  end loop;

  -- Nota duplicada (mesma chave, mesmo dono) bate no índice único e aborta
  -- a transação inteira — nada é gravado.
  insert into public.purchases
    (user_id, supplier_name, access_key, issued_on, total, source)
  values
    (v_user, v_supplier, v_key, v_issued, v_total, v_source)
  returning id into v_purchase;

  v_nota := case
    when v_supplier is null then 'Entrada por nota'
    else 'Entrada por nota — ' || v_supplier
  end;

  -- 2ª passada: grava os itens, cria os produtos novos, entra o estoque e
  -- atualiza o último custo.
  for item in select * from jsonb_array_elements(p_itens)
  loop
    v_pid     := nullif(item ->> 'product_id', '')::uuid;
    v_is_new  := coalesce((item ->> 'is_new')::boolean, false);
    v_desc    := btrim(coalesce(item ->> 'description', ''));
    v_barcode := nullif(btrim(coalesce(item ->> 'barcode', '')), '');
    v_qty     := (item ->> 'quantity')::numeric;
    v_cost    := round((item ->> 'unit_cost')::numeric, 2);
    v_track   := null;

    if v_is_new then
      if v_pid is not null then
        raise exception 'Item novo não pode referenciar produto existente: %', v_desc;
      end if;
      v_price := round(coalesce((item ->> 'sale_price')::numeric, 0), 2);
      if v_price < 0 then
        raise exception 'Preço de venda inválido no item: %', v_desc;
      end if;
      v_track := coalesce((item ->> 'track_stock')::boolean, true);

      -- Nasce com estoque zero: a entrada vem do mesmo caminho dos demais
      -- itens (update + stock_movements), sem contar a quantidade duas vezes.
      insert into public.products
        (user_id, name, price, cost_price, track_stock, stock_quantity)
      values
        (v_user, v_desc, v_price, v_cost, v_track,
         case when v_track then 0 else null end)
      returning id into v_pid;

      if v_barcode is not null then
        insert into public.product_barcodes (product_id, user_id, barcode)
        values (v_pid, v_user, v_barcode);
      end if;

      v_novos := v_novos + 1;

    elsif v_pid is not null then
      -- Produto referenciado precisa existir E ser do próprio usuário
      -- (a FK sozinha não garante isso, pois não passa pela RLS).
      select track_stock into v_track
      from public.products
      where id = v_pid and user_id = v_user;

      if v_track is null then
        raise exception 'Produto não encontrado';
      end if;

      v_atualizados := v_atualizados + 1;
    end if;

    v_line := round(v_cost * v_qty, 2);

    insert into public.purchase_items
      (purchase_id, user_id, product_id, description_snapshot, barcode,
       quantity, unit_cost, line_total)
    values
      (v_purchase, v_user, v_pid, v_desc, v_barcode, v_qty, v_cost, v_line);

    if v_pid is not null then
      -- ÚLTIMO CUSTO (decisão 3): a compra mais recente manda no cost_price.
      -- Quem controla estoque também recebe a entrada da quantidade.
      update public.products
        set cost_price = v_cost,
            stock_quantity = case
              when v_track then coalesce(stock_quantity, 0) + v_qty
              else stock_quantity
            end,
            updated_at = now()
      where id = v_pid and user_id = v_user;

      if v_track then
        insert into public.stock_movements
          (user_id, product_id, type, quantity, note)
        values
          (v_user, v_pid, 'purchase', v_qty, v_nota);
      end if;
    end if;
  end loop;

  -- Gasto automático em 'insumos' (decisão 4), na data da compra. A tabela
  -- expenses exige amount > 0, então nota de valor zero (bonificação) não
  -- gera lançamento.
  if v_total > 0 then
    insert into public.expenses
      (user_id, incurred_on, category, amount, description)
    values
      (v_user, v_issued, 'insumos', v_total,
       case
         when v_supplier is null then 'Compra de mercadorias (nota lançada)'
         else 'Compra de mercadorias — ' || v_supplier
       end)
    returning id into v_expense;
  end if;

  return jsonb_build_object(
    'purchase_id', v_purchase,
    'total', v_total,
    'produtos_atualizados', v_atualizados,
    'produtos_novos', v_novos,
    'expense_id', v_expense
  );
end;
$$;
