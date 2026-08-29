-- =====================================================================
-- Gaveta — 0017: origem 'ia' na nota de compra (fase G2d)
--
-- ⚠️ Banco COMPARTILHADO com o FiadoApp. Só a tabela public.purchases é
-- tocada. NADA em fiado_* é alterado.
--
-- Por que existe: a leitura por IA de visão é a via mais nova e a que mais
-- pede rastreabilidade. Se um dia um número errado chegar aos livros, tem
-- de dar para saber QUAL nota veio de leitura automática por IA — e não
-- confundir com a foto lida por OCR local, que entrega bem menos.
--
-- Aditiva e compatível: só amplia a lista aceita; nenhuma linha existente
-- deixa de ser válida.
-- =====================================================================

alter table public.purchases drop constraint if exists purchases_source_check;
alter table public.purchases
  add constraint purchases_source_check
  check (source in ('manual', 'pdf', 'foto', 'xml', 'ia'));

comment on column public.purchases.source is
  'Como a nota entrou: manual (digitada), pdf/xml (extração exata, G2b), foto (OCR local — só nomes, G2c) ou ia (leitura por IA de visão, G2d).';

-- ---------- 2. registrar_compra aceita a origem 'ia' ----------
-- A RPC valida a origem por conta própria (defesa em profundidade: o app
-- pode errar, o banco não deixa passar). Sem esta atualização, lançar uma
-- nota lida por IA falharia com "Origem da nota inválida".
--
-- Igual à versão da 0015, com uma única linha diferente — a lista de
-- origens aceitas. A função vem inteira porque é assim que se lê o estado
-- atual dela sem caçar em três arquivos.

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

  return jsonb_build_object(
    'purchase_id', v_purchase,
    'total', v_total,
    'produtos_atualizados', v_atualizados,
    'produtos_novos', v_novos,
    'expense_id', v_expense
  );
end;
$$;
