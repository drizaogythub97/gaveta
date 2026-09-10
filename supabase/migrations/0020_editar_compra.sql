-- =====================================================================
-- Gaveta — 0020: editar uma nota de compra já lançada (roadmap H1)
--
-- ⚠️ Banco COMPARTILHADO com o FiadoApp. Tudo aqui é do lado do GAVETA
-- (public.purchases / purchase_items / products / stock_movements /
-- expenses). NADA em fiado_* é tocado.
--
-- Motivo: hoje o único jeito de corrigir uma nota é ESTORNAR e relançar
-- (G2a.1). Funciona, mas é ríspido para o caso comum — um valor digitado
-- errado, o nome do fornecedor trocado, a data. O dono avisou que quase
-- sempre ajusta valores, porque o preço final nem sempre é o impresso.
--
-- O que entra (tudo ADITIVO):
--   1. purchases.edited_at — quando a nota foi corrigida (null = nunca).
--   2. Política de DELETE em purchase_items + trigger que só deixa apagar
--      item pela RPC de edição (ou quando a própria nota está indo embora).
--   3. purchases_guard_update reemitido: durante a edição (e SÓ nela) os
--      campos do cabeçalho podem mudar. Fora dela a nota segue sendo
--      histórico, como desde a 0015.
--   4. RPC editar_compra: numa ÚNICA transação troca os itens da nota e
--      acerta estoque, último custo e o gasto em 'insumos'.
--
-- As três decisões que sustentam esta migration:
--
-- • ESTOQUE ANDA PELA DIFERENÇA, não por "estorna e relança". Estornar
--   zeraria o estoque de quem já vendeu parte da mercadoria (o estorno
--   corta em zero, por causa do check >= 0) e o relançamento devolveria a
--   quantidade INTEIRA — a venda sumiria da conta. Corrigir uma nota de 10
--   para 12 unidades tem de mexer 2, e é isso que a RPC faz.
--
-- • O CUSTO DA VENDA JÁ FECHADA NÃO É TOCADO. sale_items.unit_cost é
--   snapshot do momento da venda (G1). Corrigir a compra muda o custo do
--   produto daqui para a frente; o fechamento Lucro × Custo de dias
--   passados continua exatamente como estava.
--
-- • O GASTO É O MESMO LANÇAMENTO, corrigido. Apagar e recriar mudaria o id
--   e faria a nota perder o vínculo — e um gasto novo apareceria no
--   Financeiro como se fosse outra compra.
--
-- Nota CANCELADA não se edita: para ela o caminho continua sendo relançar.
-- =====================================================================

-- ---------- 1. purchases.edited_at ----------
alter table public.purchases
  add column if not exists edited_at timestamptz;

comment on column public.purchases.edited_at is
  'Quando a nota foi corrigida pela ultima vez (RPC editar_compra). Null = nunca editada.';

-- ---------- 2. purchase_items: DELETE só pela edição ----------
-- A RPC é security invoker: sem política de DELETE a troca dos itens seria
-- silenciosamente ignorada pela RLS (0 linhas, sem erro). A política abre o
-- DELETE das próprias linhas; o trigger garante que ele só aconteça dentro
-- da RPC, que é quem acerta estoque, custo e gasto junto.
drop policy if exists "purchase_items_delete_own" on public.purchase_items;
create policy "purchase_items_delete_own"
  on public.purchase_items for delete
  using (auth.uid() = user_id);

create or replace function public.purchase_items_guard_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- A RPC editar_compra sinaliza por um GUC local à transação, que morre
  -- junto com ela. É assim que o guard distingue a troca de itens de um
  -- DELETE direto na API (a tabela é exposta pelo PostgREST).
  if coalesce(pg_catalog.current_setting('gaveta.edicao', true), '')
     = old.purchase_id::text then
    return old;
  end if;

  -- Cascata: a nota inteira (ou a conta) está sendo apagada. Não há
  -- invariante a proteger — o pai vai junto. Sem esta saída, apagar uma
  -- conta falharia, porque purchase_items cascateia de auth.users também.
  if not exists (
    select 1 from public.purchases p where p.id = old.purchase_id
  ) then
    return old;
  end if;

  -- Sem usuário autenticado é a chave de serviço (manutenção). O anônimo
  -- não chega aqui: a política de DELETE exige auth.uid() = user_id.
  if (select auth.uid()) is null then
    return old;
  end if;

  raise exception 'Item de nota só muda pela edição da nota';
end;
$$;

drop trigger if exists trg_purchase_items_guard_delete on public.purchase_items;
create trigger trg_purchase_items_guard_delete
  before delete on public.purchase_items
  for each row execute function public.purchase_items_guard_delete();

-- ---------- 3. purchases_guard_update: abre o cabeçalho na edição ----------
create or replace function public.purchases_guard_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  -- Mesma ideia do GUC do estorno: a RPC de edição se identifica pela nota
  -- que está editando, dentro da transação dela.
  v_editando boolean := coalesce(
    pg_catalog.current_setting('gaveta.edicao', true), ''
  ) = new.id::text;
begin
  -- Identidade e origem da nota são histórico em qualquer situação.
  if new.id         is distinct from old.id
  or new.user_id    is distinct from old.user_id
  or new.created_at is distinct from old.created_at
  or new.source     is distinct from old.source
  then
    raise exception 'Nota lançada é histórico: só o cancelamento pode mudar';
  end if;

  if not v_editando then
    -- Fora da edição vale a regra da 0015: só o cancelamento muda, e o
    -- expense_id só pode caminhar para null (ação on delete set null da FK
    -- quando o gasto é removido no financeiro).
    if new.supplier_name is distinct from old.supplier_name
    or new.access_key    is distinct from old.access_key
    or new.issued_on     is distinct from old.issued_on
    or new.total         is distinct from old.total
    or new.edited_at     is distinct from old.edited_at
    or (new.expense_id is distinct from old.expense_id and new.expense_id is not null)
    then
      raise exception 'Nota lançada é histórico: só o cancelamento pode mudar';
    end if;
  else
    -- Editar é reescrever os efeitos da nota; cancelar é outra operação,
    -- com outra RPC. Uma não faz o trabalho da outra.
    if new.voided_at is distinct from old.voided_at then
      raise exception 'Cancelamento de nota só pelo estorno';
    end if;
    if old.voided_at is not null then
      raise exception 'Nota cancelada não pode ser editada';
    end if;
  end if;

  -- Cancelamento é definitivo (não "descancela" nem recancela).
  if old.voided_at is not null and new.voided_at is distinct from old.voided_at then
    raise exception 'Esta nota já foi cancelada';
  end if;

  -- O cancelamento só vale pela RPC estornar_compra, que é quem desfaz
  -- estoque, custo e gasto. Sem esta trava um PATCH direto marcaria a nota
  -- como cancelada deixando o estoque e o financeiro inconsistentes.
  if new.voided_at is distinct from old.voided_at
     and coalesce(pg_catalog.current_setting('gaveta.estorno', true), '')
         <> new.id::text
  then
    raise exception 'Cancelamento de nota só pelo estorno';
  end if;

  return new;
end;
$$;

-- ---------- 4. RPC editar_compra (transação única) ----------
-- p_purchase : { supplier_name, access_key, issued_on }  (source é histórico)
-- p_itens    : mesmas três formas da registrar_compra —
--   a) produto existente : { product_id, description, barcode?, quantity, unit_cost }
--   b) produto novo      : { is_new: true, description, barcode?, quantity,
--                            unit_cost, sale_price, track_stock?, tags?, new_tags? }
--   c) sem vínculo       : { description, quantity, unit_cost }
--
-- Como em registrar_compra, o total é SOMADO dos itens: o gasto lançado no
-- Financeiro é sempre igual ao que entrou no estoque.
create or replace function public.editar_compra(
  p_purchase_id uuid,
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
  v_supplier      text;
  v_key           text;
  v_issued        date;
  v_total         numeric(12,2) := 0;
  v_expense       uuid;
  v_voided        timestamptz;
  v_desc_gasto    text;
  v_gasto         text;
  v_antes         jsonb;                  -- itens como estavam
  v_depois        jsonb := '[]'::jsonb;   -- itens como ficaram
  v_novos         integer := 0;
  v_atualizados   integer := 0;
  v_itens         integer := 0;
  v_parcial       boolean := false;
  v_custos        integer := 0;
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
  rec             record;
  v_stock         numeric(12,3);
  v_cost_atual    numeric(12,2);
  v_delta         numeric(12,3);
  v_aplicado      numeric(12,3);
  v_anterior      numeric(12,2);
begin
  if v_user is null then
    raise exception 'Não autenticado';
  end if;
  if p_itens is null or jsonb_array_length(p_itens) = 0 then
    raise exception 'Nota sem itens';
  end if;

  -- Trava a nota do próprio usuário (evita duplo clique concorrente e duas
  -- edições se atropelando).
  select voided_at, expense_id
    into v_voided, v_expense
  from public.purchases
  where id = p_purchase_id and user_id = v_user
  for update;

  if not found then
    raise exception 'Nota não encontrada';
  end if;
  if v_voided is not null then
    raise exception 'Nota cancelada não pode ser editada';
  end if;

  v_supplier := nullif(btrim(coalesce(p_purchase ->> 'supplier_name', '')), '');
  v_key      := nullif(btrim(coalesce(p_purchase ->> 'access_key', '')), '');
  v_issued   := coalesce(nullif(p_purchase ->> 'issued_on', '')::date, current_date);

  if v_key is not null and v_key !~ '^[0-9]{44}$' then
    raise exception 'Chave de acesso inválida';
  end if;
  if v_issued > current_date then
    raise exception 'Data da compra no futuro';
  end if;

  -- 1ª passada: valida cada item e soma o total da nota corrigida.
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

  -- Retrato dos itens ANTES da troca: é com ele que o acerto de estoque e
  -- de custo compara depois. Item sem produto vinculado (produto apagado
  -- desde então) não tem o que acertar.
  select coalesce(
           jsonb_agg(jsonb_build_object(
             'pid', pi.product_id, 'qty', pi.quantity, 'cost', pi.unit_cost)),
           '[]'::jsonb)
    into v_antes
  from public.purchase_items pi
  where pi.purchase_id = p_purchase_id
    and pi.user_id = v_user
    and pi.product_id is not null;

  -- Libera os guards para ESTA nota, só dentro desta transação.
  perform pg_catalog.set_config('gaveta.edicao', p_purchase_id::text, true);

  delete from public.purchase_items
  where purchase_id = p_purchase_id and user_id = v_user;

  v_nota := case
    when v_supplier is null then 'Correção de nota'
    else 'Correção de nota — ' || v_supplier
  end;

  -- 2ª passada: grava os itens novos e cria os produtos que ainda não
  -- existem. Estoque e custo NÃO são mexidos aqui: eles são acertados
  -- depois, comparando o antes com o depois.
  for item in select * from jsonb_array_elements(p_itens)
  loop
    v_pid     := nullif(item ->> 'product_id', '')::uuid;
    v_is_new  := coalesce((item ->> 'is_new')::boolean, false);
    v_desc    := btrim(coalesce(item ->> 'description', ''));
    v_barcode := nullif(btrim(coalesce(item ->> 'barcode', '')), '');
    v_qty     := (item ->> 'quantity')::numeric;
    v_cost    := round((item ->> 'unit_cost')::numeric, 2);
    v_track   := null;
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

      -- Nasce com estoque zero: a entrada vem do acerto lá embaixo, pelo
      -- mesmo caminho dos demais itens.
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
      (p_purchase_id, v_user, v_pid, v_desc, v_barcode, v_qty, v_cost, v_line);

    v_itens := v_itens + 1;

    if v_pid is not null then
      v_depois := v_depois || jsonb_build_array(
        jsonb_build_object('pid', v_pid, 'qty', v_qty, 'cost', v_cost));

      if array_length(v_tags, 1) is not null
         or array_length(v_novas_tags, 1) is not null then
        perform public.aplicar_tags_no_produto(v_pid, v_tags, v_novas_tags);
      end if;
    end if;
  end loop;

  -- 3ª passada: o acerto. Um produto por vez, somando o que a nota trazia
  -- antes e o que ela traz agora.
  for rec in
    select
      u.pid,
      coalesce(sum(u.qty_antes), 0)  as qty_antes,
      coalesce(sum(u.qty_depois), 0) as qty_depois,
      -- O custo que a nota passa a ditar é o do ÚLTIMO item daquele produto
      -- na nota — mesma ordem em que registrar_compra os aplicaria.
      (array_agg(u.custo order by (u.custo is null), u.ord desc))[1] as custo_depois
    from (
      select (e.valor ->> 'pid')::uuid  as pid,
             (e.valor ->> 'qty')::numeric as qty_antes,
             null::numeric              as qty_depois,
             null::numeric              as custo,
             e.ord
        from jsonb_array_elements(v_antes) with ordinality as e(valor, ord)
      union all
      select (e.valor ->> 'pid')::uuid,
             null::numeric,
             (e.valor ->> 'qty')::numeric,
             (e.valor ->> 'cost')::numeric,
             e.ord
        from jsonb_array_elements(v_depois) with ordinality as e(valor, ord)
    ) u
    group by u.pid
  loop
    select track_stock, stock_quantity, cost_price
      into v_track, v_stock, v_cost_atual
    from public.products
    where id = rec.pid and user_id = v_user
    for update;

    -- Produto apagado depois da compra: não há o que acertar nele.
    if not found then
      continue;
    end if;

    -- ESTOQUE: anda só a DIFERENÇA. Quem já vendeu parte da mercadoria não
    -- pode ver o estoque zerar por causa de uma correção de valor.
    -- products.stock_quantity tem check >= 0, então uma redução maior que o
    -- que existe é cortada em zero e o retorno sinaliza 'estoque_parcial'.
    v_delta := rec.qty_depois - rec.qty_antes;
    if v_track and v_delta <> 0 then
      v_aplicado := v_delta;
      if coalesce(v_stock, 0) + v_delta < 0 then
        v_aplicado := -coalesce(v_stock, 0);
        v_parcial := true;
      end if;

      if v_aplicado <> 0 then
        update public.products
          set stock_quantity = coalesce(stock_quantity, 0) + v_aplicado,
              updated_at = now()
        where id = rec.pid and user_id = v_user;

        insert into public.stock_movements
          (user_id, product_id, type, quantity, note)
        values
          (v_user, rec.pid,
           case when v_aplicado > 0 then 'purchase' else 'void' end,
           v_aplicado, v_nota);
      end if;
    end if;

    if rec.custo_depois is not null then
      -- O produto continua na nota. O custo dele só muda se o custo atual
      -- ainda for o que ESTA nota tinha posto (ou se o produto acabou de
      -- entrar nela, caso em que vale o último custo, como no lançamento).
      -- Se o dono digitou outro custo depois, ou uma nota mais nova mandou,
      -- o valor deles é respeitado.
      if rec.qty_antes = 0
         or v_cost_atual is null
         or exists (
              select 1 from jsonb_array_elements(v_antes) as e
              where (e.value ->> 'pid')::uuid = rec.pid
                and (e.value ->> 'cost')::numeric = v_cost_atual)
      then
        if v_cost_atual is distinct from rec.custo_depois then
          update public.products
            set cost_price = rec.custo_depois,
                updated_at = now()
          where id = rec.pid and user_id = v_user;
          v_custos := v_custos + 1;
        end if;
      end if;

    elsif v_cost_atual is not null
          and exists (
            select 1 from jsonb_array_elements(v_antes) as e
            where (e.value ->> 'pid')::uuid = rec.pid
              and (e.value ->> 'cost')::numeric = v_cost_atual)
    then
      -- O item saiu da nota: mesmo caminho do estorno — o custo volta ao da
      -- compra ativa mais recente daquele produto.
      select pi.unit_cost into v_anterior
      from public.purchase_items pi
      join public.purchases p on p.id = pi.purchase_id
      where pi.product_id = rec.pid
        and pi.user_id = v_user
        and pi.purchase_id <> p_purchase_id
        and p.voided_at is null
      order by p.issued_on desc, p.created_at desc
      limit 1;

      if v_anterior is not null then
        update public.products
          set cost_price = v_anterior,
              updated_at = now()
        where id = rec.pid and user_id = v_user;
        v_custos := v_custos + 1;
      end if;
      v_anterior := null;
    end if;
  end loop;

  -- GASTO: o MESMO lançamento, corrigido. A tabela expenses exige
  -- amount > 0, então nota que virou valor zero (bonificação) perde o
  -- gasto em vez de guardar um lançamento de R$ 0,00.
  v_desc_gasto := case
    when v_supplier is null then 'Compra de mercadorias (nota lançada)'
    else 'Compra de mercadorias — ' || v_supplier
  end;

  if v_total > 0 then
    if v_expense is not null then
      update public.expenses
        set incurred_on = v_issued,
            amount      = v_total,
            description = v_desc_gasto
      where id = v_expense and user_id = v_user;

      if found then
        v_gasto := 'atualizado';
      else
        -- O gasto foi apagado à mão no Financeiro: a correção o recria.
        v_expense := null;
      end if;
    end if;

    if v_expense is null then
      insert into public.expenses
        (user_id, incurred_on, category, amount, description)
      values
        (v_user, v_issued, 'insumos', v_total, v_desc_gasto)
      returning id into v_expense;
      v_gasto := 'criado';
    end if;

  elsif v_expense is not null then
    delete from public.expenses
    where id = v_expense and user_id = v_user;
    v_expense := null;
    v_gasto := 'removido';
  else
    v_gasto := 'nenhum';
  end if;

  -- O cabeçalho por último: a chave de acesso repetida entre notas ATIVAS
  -- bate no índice único aqui e aborta a transação inteira — nada do que
  -- veio acima fica gravado.
  update public.purchases
    set supplier_name = v_supplier,
        access_key    = v_key,
        issued_on     = v_issued,
        total         = v_total,
        expense_id    = v_expense,
        edited_at     = now()
  where id = p_purchase_id and user_id = v_user;

  perform pg_catalog.set_config('gaveta.edicao', '', true);

  return jsonb_build_object(
    'purchase_id', p_purchase_id,
    'total', v_total,
    'itens', v_itens,
    'produtos_atualizados', v_atualizados,
    'produtos_novos', v_novos,
    'estoque_parcial', v_parcial,
    'custos_ajustados', v_custos,
    'gasto', v_gasto,
    'expense_id', v_expense
  );
end;
$$;
