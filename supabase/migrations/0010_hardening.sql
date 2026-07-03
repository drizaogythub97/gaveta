-- =====================================================================
-- Gaveta — 0010: hardening pós-v1.0.0 (revisão de segurança 2026-07-03)
--
-- 1. Bucket brand-logos: limites de tamanho e MIME no nível do bucket.
--    A Server Action já valida (magic bytes, 1,5 MB), mas um usuário
--    autenticado poderia chamar a Storage API direto e subir qualquer
--    arquivo na própria pasta. O bucket passa a recusar sozinho.
-- 2. search_path fixado ('' = tudo schema-qualificado) em todas as
--    funções — zera o alerta "function_search_path_mutable" do Supabase
--    Security Advisor. Os corpos já qualificam public.* em toda referência.
-- 3. register_sale: product_id informado nos itens agora precisa
--    pertencer ao usuário (a checagem de FK não passa pela RLS, então
--    antes era possível referenciar o UUID de um produto alheio — sem
--    vazamento, mas poluía os próprios dados e servia de oráculo).
-- 4. RPCs de agregação sales_summary / expenses_summary: somas feitas
--    no banco. Os KPIs do Financeiro/Dashboard somavam linhas no JS e o
--    PostgREST corta em 1000 linhas — acima disso os valores saíam
--    menores, sem erro. Agregando no banco o resultado é exato e a
--    página trafega bytes em vez de milhares de linhas.
--
-- Tudo aditivo/compatível com a main (assinaturas preservadas).
-- =====================================================================

-- ---------- 1. Limites do bucket brand-logos ----------
update storage.buckets
  set file_size_limit = 2097152, -- 2 MB (a action já limita a 1,5 MB)
      allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
  where id = 'brand-logos';

-- ---------- 2. search_path fixado nas funções existentes ----------
alter function public.handle_new_user() set search_path = '';
alter function public.set_sale_status(uuid, text) set search_path = '';
alter function public.adjust_stock(uuid, text, numeric) set search_path = '';
alter function public.open_cash_session(numeric, text) set search_path = '';
alter function public.add_cash_movement(text, numeric, text) set search_path = '';
alter function public.close_cash_session(numeric, text) set search_path = '';

-- ---------- 3. register_sale: exige produto do próprio usuário ----------
-- Mesma assinatura de 0007 (compatível com o app em produção); além da
-- checagem de propriedade, ganha search_path fixado.
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
set search_path = ''
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
  v_session       uuid;
  item            jsonb;
  v_qty           numeric(12,3);
  v_price         numeric(12,2);
  v_line          numeric(12,2);
  v_pid           uuid;
  v_name          text;
  v_track         boolean;
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

  -- Vincula à sessão de caixa aberta apenas quando a venda é em dinheiro.
  if v_method = 'dinheiro' then
    select id into v_session
    from public.cash_sessions
    where user_id = v_user and status = 'open'
    limit 1;
  end if;

  insert into public.sales (user_id, total, status, payment_method, installments, fee_amount, discount_amount, cash_session_id)
  values (v_user, 0, 'completed', v_method, v_installments, v_fee, 0, v_session)
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

    -- Produto referenciado precisa existir E ser do próprio usuário
    -- (a FK sozinha não garante isso, pois não passa pela RLS).
    v_track := null;
    if v_pid is not null then
      select track_stock into v_track
      from public.products
      where id = v_pid and user_id = v_user;

      if v_track is null then
        raise exception 'Produto não encontrado';
      end if;
    end if;

    v_line     := round(v_price * v_qty, 2);
    v_subtotal := v_subtotal + v_line;

    insert into public.sale_items
      (sale_id, user_id, product_id, name_snapshot, unit_price, quantity, line_total)
    values
      (v_sale, v_user, v_pid, v_name, v_price, v_qty, v_line);

    if v_pid is not null and v_track then
      update public.products
        set stock_quantity = greatest(coalesce(stock_quantity, 0) - v_qty, 0),
            updated_at = now()
      where id = v_pid and user_id = v_user;

      insert into public.stock_movements (user_id, product_id, type, quantity, sale_id)
      values (v_user, v_pid, 'sale', -v_qty, v_sale);
    end if;
  end loop;

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

-- ---------- 4a. RPC sales_summary: agregado de vendas no banco ----------
-- p_methods nulo = todas as formas de pagamento. security invoker: a RLS
-- continua valendo; o filtro por auth.uid() é defesa em profundidade.
create or replace function public.sales_summary(
  p_from timestamptz,
  p_to timestamptz,
  p_methods text[] default null
)
returns table (
  gross_total numeric,
  fees_total numeric,
  completed_count bigint,
  voided_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    coalesce(sum(s.total) filter (where s.status = 'completed'), 0)::numeric(12,2),
    coalesce(sum(s.fee_amount) filter (where s.status = 'completed'), 0)::numeric(12,2),
    count(*) filter (where s.status = 'completed'),
    count(*) filter (where s.status = 'voided')
  from public.sales s
  where s.user_id = auth.uid()
    and s.created_at >= p_from
    and s.created_at <= p_to
    and (p_methods is null or s.payment_method = any(p_methods));
$$;

-- ---------- 4b. RPC expenses_summary: despesas por categoria ----------
create or replace function public.expenses_summary(
  p_from date,
  p_to date
)
returns table (
  category text,
  total numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select e.category, coalesce(sum(e.amount), 0)::numeric(12,2)
  from public.expenses e
  where e.user_id = auth.uid()
    and e.incurred_on >= p_from
    and e.incurred_on <= p_to
  group by e.category;
$$;
