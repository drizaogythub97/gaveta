-- =====================================================================
-- ERP Simples — 0002: forma de pagamento por venda
-- - Adiciona public.sales.payment_method (text, check) com backfill em
--   'dinheiro' para registros antigos.
-- - Atualiza a função RPC public.register_sale para receber e gravar
--   payment_method, mantendo o default 'dinheiro' para compatibilidade
--   com chamadas existentes.
-- - Evolução futura: taxas por método (pix/débito/crédito/vale) virão de
--   uma tabela de preferências do usuário e serão aplicadas nos
--   relatórios financeiros — fora do escopo desta migração.
-- =====================================================================

-- ---------- Coluna ----------
alter table public.sales
  add column if not exists payment_method text not null default 'dinheiro'
    check (payment_method in ('dinheiro','pix','debito','credito','vale'));

-- Remove o default para forçar inserts a especificarem o método.
alter table public.sales alter column payment_method drop default;

-- ---------- RPC ----------
-- Dropa a versão antiga (assinatura sem payment_method).
drop function if exists public.register_sale(jsonb);

create or replace function public.register_sale(
  items jsonb,
  payment_method text default 'dinheiro'
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_user   uuid := auth.uid();
  v_sale   uuid;
  v_total  numeric(12,2) := 0;
  v_method text;
  item     jsonb;
  v_qty    numeric(12,3);
  v_price  numeric(12,2);
  v_line   numeric(12,2);
  v_pid    uuid;
  v_name   text;
begin
  if v_user is null then
    raise exception 'Não autenticado';
  end if;
  if items is null or jsonb_array_length(items) = 0 then
    raise exception 'Venda sem itens';
  end if;

  v_method := coalesce(register_sale.payment_method, 'dinheiro');
  if v_method not in ('dinheiro','pix','debito','credito','vale') then
    raise exception 'Forma de pagamento inválida: %', v_method;
  end if;

  insert into public.sales (user_id, total, status, payment_method)
  values (v_user, 0, 'completed', v_method)
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

    v_line  := round(v_price * v_qty, 2);
    v_total := v_total + v_line;

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
    end if;
  end loop;

  update public.sales set total = v_total where id = v_sale;
  return v_sale;
end;
$$;
