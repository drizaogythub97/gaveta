-- =====================================================================
-- Gaveta — 0015: estorno (cancelamento) de nota de compra — plano 08, G2a.1
--
-- ⚠️ Banco COMPARTILHADO com o FiadoApp. Tudo aqui é do lado do GAVETA
-- (public.purchases / purchase_items / products / stock_movements /
-- expenses). NADA em fiado_* é tocado.
--
-- Motivo: em uso diário acontece lançar a nota errada (ou duas vezes) e
-- hoje não há como corrigir — a G2a nasceu sem edição/exclusão. O estorno
-- desfaz os efeitos SEM apagar o histórico: a nota fica marcada como
-- cancelada e continua visível.
--
-- O que entra (tudo ADITIVO):
--   1. purchases.voided_at  — quando a nota foi cancelada (null = ativa).
--   2. purchases.expense_id — link para o gasto automático em 'insumos',
--      para o estorno saber exatamente qual lançamento remover (antes o
--      gasto não tinha vínculo nenhum com a nota). Backfill das notas já
--      lançadas quando o casamento é inequívoco.
--   3. Política de UPDATE em purchases + trigger que só deixa mudar o
--      cancelamento: o resto da nota continua sendo histórico imutável.
--   4. O índice único da chave de acesso passa a ignorar notas canceladas
--      — cancelar a nota errada libera relançar a MESMA nota corrigida.
--   5. registrar_compra: grava o gasto ANTES da nota para guardar o
--      expense_id no insert (não existe UPDATE de campo de histórico).
--   6. RPC estornar_compra: numa única transação tira o estoque que
--      entrou, desfaz o último custo, remove o gasto e marca a nota.
-- =====================================================================

-- ---------- 1. Colunas novas ----------
alter table public.purchases
  add column if not exists voided_at timestamptz;

-- on delete set null: se o dono apagar o gasto direto no financeiro, a nota
-- apenas perde o vínculo (o trigger do item 3 permite essa transição).
alter table public.purchases
  add column if not exists expense_id uuid
    references public.expenses(id) on delete set null;

comment on column public.purchases.voided_at is
  'Quando a nota foi cancelada (estorno). Null = nota ativa. O histórico da nota nunca é apagado.';
comment on column public.purchases.expense_id is
  'Gasto automático em insumos gerado por esta nota — o estorno remove exatamente este lançamento.';

-- ---------- 2. Backfill do expense_id das notas já lançadas ----------
-- Só vincula quando o casamento é inequívoco (uma nota ↔ um gasto): mesmo
-- dono, mesma data, categoria insumos, mesmo valor e a descrição que a
-- própria registrar_compra gera. Ambiguidade fica sem vínculo (o estorno
-- avisa que o gasto precisa ser conferido à mão).
with pares as (
  select
    p.id as purchase_id,
    e.id as expense_id,
    count(*) over (partition by p.id) as gastos_por_nota,
    count(*) over (partition by e.id) as notas_por_gasto
  from public.purchases p
  join public.expenses e
    on  e.user_id     = p.user_id
    and e.category    = 'insumos'
    and e.incurred_on = p.issued_on
    and e.amount      = p.total
    and e.description = case
          when p.supplier_name is null then 'Compra de mercadorias (nota lançada)'
          else 'Compra de mercadorias — ' || p.supplier_name
        end
  where p.expense_id is null
)
update public.purchases p
   set expense_id = pares.expense_id
  from pares
 where pares.purchase_id = p.id
   and pares.gastos_por_nota = 1
   and pares.notas_por_gasto = 1;

-- ---------- 3. RLS de UPDATE + trigger de imutabilidade ----------
-- A RPC é security invoker: sem política de UPDATE o "set voided_at" seria
-- silenciosamente ignorado pela RLS (0 linhas, sem erro). A política abre o
-- UPDATE da própria linha; o trigger garante que só o cancelamento muda.
drop policy if exists "purchases_update_own" on public.purchases;
create policy "purchases_update_own"
  on public.purchases for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.purchases_guard_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- expense_id só pode caminhar para null (ação on delete set null da FK
  -- quando o gasto é removido); qualquer outro campo é histórico.
  if new.id            is distinct from old.id
  or new.user_id       is distinct from old.user_id
  or new.supplier_name is distinct from old.supplier_name
  or new.access_key    is distinct from old.access_key
  or new.issued_on     is distinct from old.issued_on
  or new.total         is distinct from old.total
  or new.source        is distinct from old.source
  or new.created_at    is distinct from old.created_at
  or (new.expense_id is distinct from old.expense_id and new.expense_id is not null)
  then
    raise exception 'Nota lançada é histórico: só o cancelamento pode mudar';
  end if;

  -- Cancelamento é definitivo (não "descancela" nem recancela).
  if old.voided_at is not null and new.voided_at is distinct from old.voided_at then
    raise exception 'Esta nota já foi cancelada';
  end if;

  -- O cancelamento só vale pela RPC estornar_compra, que é quem desfaz
  -- estoque, custo e gasto. A tabela é exposta pela API (PostgREST), então
  -- sem esta trava um PATCH direto marcaria a nota como cancelada deixando
  -- o estoque e o financeiro inconsistentes. A RPC sinaliza por um GUC
  -- local à transação, que morre junto com ela.
  if new.voided_at is distinct from old.voided_at
     and coalesce(pg_catalog.current_setting('gaveta.estorno', true), '')
         <> new.id::text
  then
    raise exception 'Cancelamento de nota só pelo estorno';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_purchases_guard_update on public.purchases;
create trigger trg_purchases_guard_update
  before update on public.purchases
  for each row execute function public.purchases_guard_update();

-- ---------- 4. Chave de acesso: nota cancelada libera a chave ----------
-- Antes: uma chave só podia existir uma vez por dono, para sempre. Agora a
-- unicidade vale só entre as notas ATIVAS — quem cancelou a nota errada
-- consegue relançar a mesma nota corrigida.
drop index if exists public.uniq_purchases_user_access_key;
create unique index if not exists uniq_purchases_user_access_key
  on public.purchases(user_id, access_key)
  where access_key is not null and voided_at is null;

-- ---------- 5. registrar_compra: guarda o expense_id ----------
-- Única mudança de comportamento em relação à 0014: o gasto em 'insumos' é
-- inserido ANTES da nota, para que o id entre já no insert de purchases
-- (não há UPDATE de campo de histórico). O resto é idêntico.
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

-- ---------- 6. RPC estornar_compra (transação única) ----------
-- Desfaz os efeitos da nota e a marca como cancelada. Nada é apagado: a
-- nota e seus itens continuam no histórico, e a saída de estoque vira um
-- movimento 'void' (quantidade negativa, como toda saída).
--
-- Regras:
--   • Estoque: sai o que entrou. products.stock_quantity tem check >= 0,
--     então se parte da mercadoria já foi vendida, sai o que ainda existe
--     e o retorno sinaliza 'estoque_parcial'.
--   • Último custo: só é desfeito se o cost_price atual ainda for o desta
--     nota; volta para o custo da compra ativa mais recente do produto. Se
--     o dono digitou outro custo depois, o dele é respeitado.
--   • Gasto: remove o lançamento vinculado (expense_id). Sem vínculo (nota
--     antiga ao backfill ou gasto já apagado à mão) → 'gasto_removido'
--     falso, e a tela avisa para conferir no financeiro.
--   • Produtos criados por esta nota NÃO são apagados: podem já ter venda.
create or replace function public.estornar_compra(p_purchase_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user       uuid := auth.uid();
  v_supplier   text;
  v_voided     timestamptz;
  v_expense    uuid;
  v_nota       text;
  v_itens      integer := 0;
  v_parcial    boolean := false;
  v_custos     integer := 0;
  v_gasto      boolean := false;
  rec          record;
  v_track      boolean;
  v_stock      numeric(12,3);
  v_cost       numeric(12,2);
  v_remove     numeric(12,3);
  v_anterior   numeric(12,2);
begin
  if v_user is null then
    raise exception 'Não autenticado';
  end if;

  -- Trava a nota do próprio usuário (evita duplo clique concorrente).
  select supplier_name, voided_at, expense_id
    into v_supplier, v_voided, v_expense
  from public.purchases
  where id = p_purchase_id and user_id = v_user
  for update;

  if not found then
    raise exception 'Nota não encontrada';
  end if;
  if v_voided is not null then
    raise exception 'Esta nota já foi cancelada';
  end if;

  v_nota := case
    when v_supplier is null then 'Estorno de nota'
    else 'Estorno de nota — ' || v_supplier
  end;

  for rec in
    select pi.product_id, pi.quantity, pi.unit_cost
    from public.purchase_items pi
    where pi.purchase_id = p_purchase_id
      and pi.user_id = v_user
      and pi.product_id is not null
  loop
    select track_stock, stock_quantity, cost_price
      into v_track, v_stock, v_cost
    from public.products
    where id = rec.product_id and user_id = v_user
    for update;

    -- Produto apagado depois da compra: não há o que estornar nele.
    if not found then
      continue;
    end if;

    v_itens := v_itens + 1;

    if v_track then
      v_remove := least(rec.quantity, coalesce(v_stock, 0));
      if v_remove < rec.quantity then
        v_parcial := true;
      end if;
      if v_remove > 0 then
        update public.products
          set stock_quantity = coalesce(stock_quantity, 0) - v_remove,
              updated_at = now()
        where id = rec.product_id and user_id = v_user;

        insert into public.stock_movements
          (user_id, product_id, type, quantity, note)
        values
          (v_user, rec.product_id, 'void', -v_remove, v_nota);
      end if;
    end if;

    if v_cost is not null and v_cost = rec.unit_cost then
      select pi.unit_cost into v_anterior
      from public.purchase_items pi
      join public.purchases p on p.id = pi.purchase_id
      where pi.product_id = rec.product_id
        and pi.user_id = v_user
        and pi.purchase_id <> p_purchase_id
        and p.voided_at is null
      order by p.issued_on desc, p.created_at desc
      limit 1;

      if v_anterior is not null then
        update public.products
          set cost_price = v_anterior,
              updated_at = now()
        where id = rec.product_id and user_id = v_user;
        v_custos := v_custos + 1;
      end if;
      v_anterior := null;
    end if;
  end loop;

  -- Libera o trigger para ESTA nota, só dentro desta transação (o terceiro
  -- argumento é is_local): é assim que o guard distingue o estorno de um
  -- PATCH direto na tabela.
  perform pg_catalog.set_config('gaveta.estorno', p_purchase_id::text, true);

  update public.purchases
    set voided_at = now()
  where id = p_purchase_id and user_id = v_user;

  perform pg_catalog.set_config('gaveta.estorno', '', true);

  -- A FK on delete set null limpa purchases.expense_id (o trigger permite
  -- essa transição). Feito depois do update para não competir com ele.
  if v_expense is not null then
    delete from public.expenses
    where id = v_expense and user_id = v_user;
    v_gasto := found;
  end if;

  return jsonb_build_object(
    'purchase_id', p_purchase_id,
    'itens_estornados', v_itens,
    'estoque_parcial', v_parcial,
    'custos_revertidos', v_custos,
    'gasto_removido', v_gasto
  );
end;
$$;
