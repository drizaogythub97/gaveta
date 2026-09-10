-- =====================================================================
-- Gaveta — 0021: cadastrar o custo depois passa a corrigir o relatório
--
-- ⚠️ Banco COMPARTILHADO com o FiadoApp. Tudo aqui é do lado do GAVETA
-- (public.products / public.sale_items). NADA em fiado_* é tocado.
--
-- O problema, relatado pelo dono em 2026-09-10 e conferido no banco: ele
-- vendeu um produto que estava sem custo, o Fechamento avisou que as contas
-- estavam incompletas, ele cadastrou o custo do produto — e o aviso não
-- saiu. E não sairia nunca.
--
-- Por quê: o Fechamento não lê `products.cost_price`. Ele lê
-- `sale_items.unit_cost`, o RETRATO tirado no instante da venda (G1,
-- migration 0013). Produto sem custo na hora da venda → retrato nasce null,
-- e as três funções do fechamento filtram por `unit_cost is null`. Cadastrar
-- o custo depois não mexia em nada. Pior: o próprio aviso oferece o botão
-- "Informar custo", ou seja, a tela prometia uma correção que não acontecia.
--
-- Medido antes de corrigir: 63 dos 136 itens vendidos estavam sem custo
-- (R$ 1.464,90), sendo 44 com produto cadastrado e 19 avulsos.
--
-- O que entra:
--   1. Índice em sale_items(product_id) — a coluna que a lista de "sem
--      custo" agrupa e que o preenchimento abaixo filtra.
--   2. Trigger de guarda em sale_items: o item de venda continua sendo
--      histórico; a ÚNICA mudança permitida é o custo em branco receber o
--      custo atual daquele produto. Nem outro valor, nem outro campo.
--   3. Trigger em products: quando o custo sai de "em branco" para um valor,
--      os retratos vazios daquele produto são preenchidos na hora — na mesma
--      transação, venha de onde vier (edição do produto, nota de compra ou
--      um PATCH direto na API).
--   4. Preenchimento de uma vez do que já está gravado, para quem cadastrou
--      o custo ANTES desta migration existir (o caso do dono).
--
-- Por que preencher, e não calcular na leitura. A alternativa seria o
-- fechamento usar `coalesce(retrato, custo_atual)`. Aí o lucro de um dia
-- passado mudaria toda vez que o custo do produto fosse editado — e o
-- retrato existe justamente para isso não acontecer. Preencher escreve uma
-- vez, só onde não havia informação nenhuma, e devolve a estabilidade: o que
-- já tinha custo gravado nunca é reescrito.
-- =====================================================================

-- ---------- 1. Índice ----------
create index if not exists idx_sale_items_product
  on public.sale_items(product_id)
  where product_id is not null;

-- ---------- 2. O item de venda continua histórico ----------
-- sale_items sempre teve política de UPDATE (0001) e nada no sistema a
-- usava. Agora ela passa a ser usada por UM caminho só, e o guard garante
-- que nenhum outro apareça — a tabela é exposta pela API (PostgREST), então
-- sem esta trava um PATCH direto reescreveria o histórico de lucro.
create or replace function public.sale_items_guard_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_custo_atual numeric(12,2);
begin
  if new.id            is distinct from old.id
  or new.sale_id       is distinct from old.sale_id
  or new.user_id       is distinct from old.user_id
  or new.product_id    is distinct from old.product_id
  or new.name_snapshot is distinct from old.name_snapshot
  or new.unit_price    is distinct from old.unit_price
  or new.quantity      is distinct from old.quantity
  or new.line_total    is distinct from old.line_total
  then
    raise exception 'Item de venda é histórico: só o custo em branco pode ser preenchido';
  end if;

  if new.unit_cost is distinct from old.unit_cost then
    -- Custo já registrado é o retrato do dia da venda: não se reescreve.
    if old.unit_cost is not null then
      raise exception 'O custo desta venda já foi registrado e não muda';
    end if;
    if new.unit_cost is null then
      raise exception 'O custo preenchido não pode ficar em branco';
    end if;
    -- Item avulso não tem produto de onde tirar o custo — é por isso que
    -- ele aparece no Fechamento como buraco que não fecha.
    if new.product_id is null then
      raise exception 'Item avulso não tem produto de onde tirar o custo';
    end if;

    select p.cost_price into v_custo_atual
    from public.products p
    where p.id = new.product_id and p.user_id = new.user_id;

    -- O valor não é escolhido por quem chama: é o custo que o produto tem
    -- agora. Assim o preenchimento nunca vira "digitar o lucro que eu
    -- queria ter tido".
    if v_custo_atual is null or new.unit_cost is distinct from v_custo_atual then
      raise exception 'O custo preenchido tem de ser o custo atual do produto';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sale_items_guard_update on public.sale_items;
create trigger trg_sale_items_guard_update
  before update on public.sale_items
  for each row execute function public.sale_items_guard_update();

-- ---------- 3. Cadastrar o custo preenche as vendas em branco ----------
create or replace function public.products_preencher_custo_das_vendas()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Só os retratos VAZIOS daquele produto. Venda que já tinha custo gravado
  -- continua exatamente como estava — o fechamento de dias passados não
  -- pode mudar sozinho.
  update public.sale_items si
     set unit_cost = new.cost_price
   where si.product_id = new.id
     and si.user_id = new.user_id
     and si.unit_cost is null;

  return null;
end;
$$;

drop trigger if exists trg_products_preencher_custo on public.products;
create trigger trg_products_preencher_custo
  after update of cost_price on public.products
  for each row
  when (old.cost_price is null and new.cost_price is not null)
  execute function public.products_preencher_custo_das_vendas();

comment on function public.products_preencher_custo_das_vendas() is
  'Quando o produto sai de "sem custo" para um custo, preenche o retrato das vendas passadas dele que estavam em branco. Nunca reescreve retrato existente.';

-- ---------- 4. O que já estava gravado ----------
-- Quem cadastrou o custo antes desta migration não passa mais pela
-- transição do trigger. Este preenchimento vale a MESMA regra: só onde o
-- retrato está vazio e o produto tem custo hoje.
update public.sale_items si
   set unit_cost = p.cost_price
  from public.products p
 where p.id = si.product_id
   and p.user_id = si.user_id
   and si.unit_cost is null
   and p.cost_price is not null;
