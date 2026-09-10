-- 0022_fuso_da_loja.sql
--
-- O dia do lojista vira à meia-noite de BRASÍLIA, não do servidor.
--
-- O banco roda em UTC (conferido: `current_setting('TimeZone')` = 'UTC').
-- Com isso, `current_date` vira às 21h de Brasília: uma nota lançada às 22h,
-- uma despesa do fim do expediente e — o pior — uma venda a prazo nasciam
-- datadas do dia SEGUINTE, com o vencimento (+30) puxado junto. Ver o achado
-- A de `docs/10-ACHADOS-DE-LOGICA.md`.
--
-- Decisão do dono (2026-09-10): fuso FIXO em America/Sao_Paulo, igual para
-- todas as contas. O mesmo valor vive em `lib/dashboard/dates.ts`
-- (`FUSO_LOJA`) e é o que a aplicação manda como `p_tz` para as funções de
-- relatório — os dois lados precisam concordar, senão a soma dos dias deixa
-- de fechar com o total do período.
--
-- Migration ADITIVA: nenhum dado é reescrito. O que já está gravado com a
-- data de ontem/amanhã continua como está; daqui para a frente nasce certo.
--
-- ⚠️ FORA DE ESCOPO, de propósito: as funções e os defaults do FiadoApp
-- (`fiado_registrar_venda`, `fiado_clientes_com_saldo`,
-- `fiado_resumo_dashboard`, `fiado_vendas.data_compra`). O banco é
-- COMPARTILHADO entre os dois sistemas e aqueles objetos são do outro
-- projeto — mexer neles daqui quebraria a fronteira. A ponte do Gaveta
-- (`registrar_venda_fiado`) passa a data EXPLICITAMENTE, então a venda a
-- prazo criada pelo Gaveta já nasce com o dia certo.

create or replace function public.data_loja()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

comment on function public.data_loja() is
  'Hoje no fuso da loja (America/Sao_Paulo). Use no lugar de current_date: o banco roda em UTC e o dia viraria às 21h de Brasília.';

-- Defaults de data PURA. Os `now()` de created_at/updated_at continuam como
-- estão: timestamptz é instante absoluto e não sofre com fuso.
alter table public.expenses  alter column incurred_on set default public.data_loja();
alter table public.purchases alter column issued_on   set default public.data_loja();


-- ----------------------------------------------------------------------
-- registrar_compra — data padrão da nota e a recusa de nota no futuro
-- Reemitida a partir da definição VIVA do banco (pg_get_functiondef),
-- não do arquivo do repositório: é o que garante que nenhuma correção
-- anterior seja desfeita sem querer.
-- ----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.registrar_compra(p_purchase jsonb, p_itens jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
  v_issued   := coalesce(nullif(p_purchase ->> 'issued_on', '')::date, public.data_loja());
  v_source   := coalesce(nullif(p_purchase ->> 'source', ''), 'manual');

  if v_source not in ('manual','pdf','foto','xml','ia') then
    raise exception 'Origem da nota inválida: %', v_source;
  end if;
  if v_key is not null and v_key !~ '^[0-9]{44}$' then
    raise exception 'Chave de acesso inválida';
  end if;
  if v_issued > public.data_loja() then
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
$function$;

-- ----------------------------------------------------------------------
-- editar_compra — mesma regra da correção de nota
-- Reemitida a partir da definição VIVA do banco (pg_get_functiondef),
-- não do arquivo do repositório: é o que garante que nenhuma correção
-- anterior seja desfeita sem querer.
-- ----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.editar_compra(p_purchase_id uuid, p_purchase jsonb, p_itens jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
  v_issued   := coalesce(nullif(p_purchase ->> 'issued_on', '')::date, public.data_loja());

  if v_key is not null and v_key !~ '^[0-9]{44}$' then
    raise exception 'Chave de acesso inválida';
  end if;
  if v_issued > public.data_loja() then
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
$function$;

-- ----------------------------------------------------------------------
-- registrar_venda_fiado — data da venda a prazo E o vencimento (+30)
-- Reemitida a partir da definição VIVA do banco (pg_get_functiondef),
-- não do arquivo do repositório: é o que garante que nenhuma correção
-- anterior seja desfeita sem querer.
-- ----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.registrar_venda_fiado(p_items jsonb, p_itens_fiado jsonb, p_cliente_id uuid DEFAULT NULL::uuid, p_cliente jsonb DEFAULT NULL::jsonb, p_data_vencimento date DEFAULT NULL::date, p_observacao text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_user   uuid := auth.uid();
  v_ativo  boolean;
  v_venda  uuid;
  v_sale   uuid;
  v_tot_f  numeric(12,2);
  v_tot_g  numeric(12,2);
begin
  if v_user is null then
    raise exception 'Não autenticado';
  end if;

  -- Guarda de servidor: a ponte é opt-in, precisa estar ligada.
  select fiado_pdv_ativo into v_ativo
  from public.ecossistema_prefs
  where user_id = v_user;
  if not coalesce(v_ativo, false) then
    raise exception 'Integração com o FiadoApp desativada';
  end if;

  -- 1) a-receber no FiadoApp (cria/atualiza cliente inline). Vencimento
  --    default +30 dias (convenção do FiadoApp) quando não informado.
  v_venda := public.fiado_registrar_venda(
    p_itens_fiado,
    p_cliente_id,
    p_cliente,
    public.data_loja(),
    coalesce(p_data_vencimento, public.data_loja() + 30),
    p_observacao
  );
  update public.fiado_vendas set origem = 'gaveta' where id = v_venda;

  -- 2) venda no Gaveta (baixa estoque; 'fiado' não vincula ao caixa).
  v_sale := public.register_sale(p_items, 'fiado', null, 0, 0);
  update public.sales set fiado_venda_id = v_venda where id = v_sale;

  -- Defesa em profundidade: os dois lados têm que somar o MESMO total,
  -- senão o a-receber e a venda do caixa divergiriam.
  select valor_total into v_tot_f from public.fiado_vendas where id = v_venda;
  select total       into v_tot_g from public.sales        where id = v_sale;
  if v_tot_f is distinct from v_tot_g then
    raise exception 'Divergência no total da venda a prazo';
  end if;

  return jsonb_build_object('venda_id', v_venda, 'sale_id', v_sale);
end;
$function$;
