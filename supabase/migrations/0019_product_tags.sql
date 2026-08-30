-- =====================================================================
-- Gaveta — 0019: tags (categorias) de produto
--
-- ⚠️ Banco COMPARTILHADO com o FiadoApp. Tudo aqui é do lado do GAVETA
-- (public.product_tags / product_tag_links / products). NADA em fiado_* é
-- tocado.
--
-- Motivo: a listagem de produtos cresceu e não tem como agrupar nada. O
-- dono quer criar categorias ORGANICAMENTE — digitar o nome no momento do
-- cadastro, sem precisar de uma tela de "gerenciar categorias" antes.
--
-- O que entra (tudo ADITIVO):
--   1. product_tags        — a tag em si, uma por dono, nome único.
--   2. product_tag_links   — o vínculo produto ↔ tag (N para N).
--   3. aplicar_tags_no_produto — aplica tags a um produto numa transação,
--      criando na hora as que ainda não existem.
--   4. registrar_compra reemitida: o item da nota pode trazer `tags` (ids)
--      e `new_tags` (nomes), para o produto cadastrado pela entrada por
--      nota já nascer categorizado. Igual à versão da 0017 nos outros
--      pontos — vem inteira porque é assim que se lê o estado atual dela
--      sem caçar em quatro arquivos.
--
-- Nome da tag é do usuário e ele edita à vontade: é dado dele, não
-- privilégio (ver a regra de segurança do projeto). A RLS por user_id é a
-- fronteira, como em todas as outras tabelas.
-- =====================================================================

-- ---------- 1. product_tags ----------
create table if not exists public.product_tags (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null
    check (length(btrim(name)) between 1 and 30),
  created_at  timestamptz not null default now()
);

create index if not exists idx_product_tags_user on public.product_tags(user_id);

-- Único por dono, ignorando caixa e espaços nas pontas: quem digita
-- "Bebidas" depois de ter criado "bebidas" reaproveita a mesma tag em vez
-- de criar uma quase igual.
create unique index if not exists uniq_product_tags_user_name
  on public.product_tags(user_id, lower(btrim(name)));

alter table public.product_tags enable row level security;

create policy "product_tags_select_own"
  on public.product_tags for select using (auth.uid() = user_id);
create policy "product_tags_insert_own"
  on public.product_tags for insert with check (auth.uid() = user_id);
create policy "product_tags_update_own"
  on public.product_tags for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "product_tags_delete_own"
  on public.product_tags for delete using (auth.uid() = user_id);

comment on table public.product_tags is
  'Categorias de produto criadas pelo proprio dono, organicamente, no cadastro.';

-- ---------- 2. product_tag_links ----------
-- user_id repetido de propósito (como em product_barcodes): deixa a
-- política de RLS direta, sem join, e o índice do dono resolve as buscas.
create table if not exists public.product_tag_links (
  product_id  uuid not null references public.products(id) on delete cascade,
  tag_id      uuid not null references public.product_tags(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (product_id, tag_id)
);

create index if not exists idx_product_tag_links_tag
  on public.product_tag_links(user_id, tag_id);

alter table public.product_tag_links enable row level security;

create policy "product_tag_links_select_own"
  on public.product_tag_links for select using (auth.uid() = user_id);
create policy "product_tag_links_insert_own"
  on public.product_tag_links for insert with check (auth.uid() = user_id);
create policy "product_tag_links_update_own"
  on public.product_tag_links for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "product_tag_links_delete_own"
  on public.product_tag_links for delete using (auth.uid() = user_id);

comment on table public.product_tag_links is
  'Vinculo produto <-> tag. user_id repetido para a RLS nao precisar de join.';

-- ---------- 3. aplicar_tags_no_produto ----------
-- Deixa o produto com EXATAMENTE as tags informadas (as que sobraram de
-- fora são desvinculadas), criando na hora as que vieram só pelo nome.
--
-- Uma função e não inserts soltos no app porque criar-tag-e-vincular
-- precisa acontecer junto: um erro no meio não pode deixar tag órfã nem
-- produto com metade das categorias.
create or replace function public.aplicar_tags_no_produto(
  p_product uuid,
  p_tags uuid[] default '{}',
  p_new_tags text[] default '{}'
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user   uuid := auth.uid();
  v_ids    uuid[] := coalesce(p_tags, '{}');
  v_nome   text;
  v_id     uuid;
begin
  if v_user is null then
    raise exception 'Não autenticado';
  end if;

  -- O produto precisa ser do próprio usuário. A FK não garante isso (não
  -- passa pela RLS), então a checagem é explícita.
  if not exists (
    select 1 from public.products
     where id = p_product and user_id = v_user
  ) then
    raise exception 'Produto não encontrado';
  end if;

  -- Tags por id: só valem as que são do próprio dono. Id alheio é ignorado
  -- em silêncio — não há o que vazar, e não vale derrubar o cadastro
  -- inteiro por causa de uma lista malformada.
  select coalesce(array_agg(t.id), '{}') into v_ids
  from public.product_tags t
  where t.user_id = v_user and t.id = any(v_ids);

  -- Tags digitadas na hora: reaproveita a existente (mesmo nome, ignorando
  -- caixa) ou cria.
  foreach v_nome in array coalesce(p_new_tags, '{}')
  loop
    v_nome := btrim(v_nome);
    continue when v_nome = '';
    if length(v_nome) > 30 then
      raise exception 'Tag muito longa: %', v_nome;
    end if;

    select id into v_id
    from public.product_tags
    where user_id = v_user and lower(btrim(name)) = lower(v_nome);

    if v_id is null then
      insert into public.product_tags (user_id, name)
      values (v_user, v_nome)
      returning id into v_id;
    end if;

    if not (v_id = any(v_ids)) then
      v_ids := v_ids || v_id;
    end if;
  end loop;

  -- Estado final exato: tira o que saiu, põe o que entrou.
  delete from public.product_tag_links
   where product_id = p_product
     and user_id = v_user
     and not (tag_id = any(v_ids));

  insert into public.product_tag_links (product_id, tag_id, user_id)
  select p_product, id, v_user from unnest(v_ids) as id
  on conflict do nothing;

  return coalesce(array_length(v_ids, 1), 0);
end;
$$;

comment on function public.aplicar_tags_no_produto(uuid, uuid[], text[]) is
  'Deixa o produto com exatamente as tags informadas, criando as que vierem so pelo nome. Tudo numa transacao.';

-- ---------- 4. registrar_compra com tags no item ----------
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
  v_tags          uuid[];
  v_novas_tags    text[];
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

  if v_source not in ('manual','pdf','foto','xml','ia') then
    raise exception 'Origem da nota inválida: %', v_source;
  end if;
  if v_key is not null and v_key !~ '^[0-9]{44}$' then
    raise exception 'Chave de acesso inválida';
  end if;
  if v_issued > current_date then
    raise exception 'Data da compra no futuro';
  end if;

  -- 1ª passada: valida cada item e soma o total da nota. Como purchases é
  -- histórico imutável (o UPDATE só serve para cancelar), o total precisa
  -- estar pronto na hora do insert.
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

  -- Gasto automático em 'insumos' (decisão 4), na data da compra. Vem ANTES
  -- da nota para que purchases.expense_id nasça preenchido — é esse vínculo
  -- que o estorno usa para remover o lançamento certo. A tabela expenses
  -- exige amount > 0, então nota de valor zero (bonificação) não gera gasto.
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

  -- Nota duplicada (mesma chave, mesmo dono, entre as notas ativas) bate no
  -- índice único e aborta a transação inteira — nada é gravado, nem o gasto
  -- inserido acima.
  insert into public.purchases
    (user_id, supplier_name, access_key, issued_on, total, source, expense_id)
  values
    (v_user, v_supplier, v_key, v_issued, v_total, v_source, v_expense)
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
    -- Tags escolhidas na conferência da nota (0019): as que já existem vêm
    -- por id; as digitadas na hora vêm por nome e são criadas aqui dentro,
    -- na MESMA transação da nota.
    v_tags := case
      when item ? 'tags'
        then (select coalesce(array_agg(value::text::uuid), '{}')
                from jsonb_array_elements_text(item -> 'tags') as value)
      else '{}'
    end;
    v_novas_tags := case
      when item ? 'new_tags'
        then (select coalesce(array_agg(value), '{}')
                from jsonb_array_elements_text(item -> 'new_tags') as value)
      else '{}'
    end;

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

      if array_length(v_tags, 1) is not null
         or array_length(v_novas_tags, 1) is not null then
        perform public.aplicar_tags_no_produto(v_pid, v_tags, v_novas_tags);
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'purchase_id', v_purchase,
    'total', v_total,
    'produtos_atualizados', v_atualizados,
    'produtos_novos', v_novos,
    'expense_id', v_expense
  );
end;
$$;
comment on function public.registrar_compra(jsonb, jsonb) is
  'Lanca a nota de compra inteira numa transacao: nota, itens, estoque, ultimo custo, produtos novos (com tags, se vierem) e o gasto em insumos.';
