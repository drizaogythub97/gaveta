-- 0023_o_que_o_banco_garante.sql
--
-- Achados C, D e F da varredura (`docs/10-ACHADOS-DE-LOGICA.md`).
--
-- C. A TAXA DA VENDA VINHA DO NAVEGADOR e era gravada como veio. A
--    `register_sale` só conferia que não era negativa. Como o Fechamento
--    desconta essa taxa do LUCRO, qualquer divergência entre o cálculo da
--    tela e o cadastro de Preferências (aba antiga aberta, preferência
--    mudada no meio do expediente, requisição forjada) saía como lucro
--    errado, e nada denunciava. A RLS não protege contra isso: o dado é do
--    próprio usuário. Agora QUEM CALCULA A TAXA É O BANCO, lendo
--    `preferences_fees` do dono da venda. A tela continua mostrando a
--    estimativa — ela só não manda mais no que fica gravado.
--
-- D. O ESTOQUE ERA CORTADO EM ZERO e o movimento gravava a quantidade
--    cheia: vender 5 com 3 em estoque deixava saldo 0 e movimento -5. A
--    razão do estoque deixava de reconstruir o saldo, em silêncio.
--    Decisão do dono (2026-09-10): PERMITIR SALDO NEGATIVO. O saldo vai a
--    -2, o movimento continua -5, razão e saldo voltam a fechar, e o número
--    negativo denuncia que o inventário está furado. O caixa nunca trava —
--    travar o caixa com o cliente esperando é o que faz alguém desistir do
--    sistema.
--
-- F. TRÊS LIMITES para o número de parcelas (tela 2-12, Server Action 2-24,
--    banco 1-24). Passa a ser um só: 2 a 12, o que o produto realmente
--    oferece. A verdade em TypeScript vive em `lib/caixa/parcelas.ts`; este
--    arquivo é a outra metade, porque o banco não lê TypeScript.
--
-- FORA DE ESCOPO, de propósito: `estornar_compra` e `editar_compra`
-- continuam CORTANDO em zero e sinalizando `estoque_parcial`. Ali o corte é
-- decisão tomada e AVISADA ao usuário na tela (não é silenciosa, que era o
-- defeito do achado D), e desfazê-la é outra decisão de produto. Se um dia
-- for revista, o lugar é aqui junto.

-- ----------------------------------------------------------------------
-- D. O saldo pode ficar negativo. A regra de "quem controla estoque tem
--    quantidade" (products_stock_qty_when_tracked) CONTINUA valendo.
-- ----------------------------------------------------------------------
alter table public.products drop constraint if exists products_stock_quantity_check;

comment on column public.products.stock_quantity is
  'Saldo em estoque. PODE SER NEGATIVO: vender mais do que existe e permitido (o caixa nao trava) e o saldo negativo denuncia o inventario furado. Ver achado D de docs/10-ACHADOS-DE-LOGICA.md.';


-- ----------------------------------------------------------------------
-- register_sale — taxa calculada no banco, estoque sem corte, parcelas 2-12
-- Reemitida a partir da definição VIVA do banco (pg_get_functiondef),
-- não do arquivo do repositório: é o que garante que nenhuma correção
-- anterior seja desfeita sem querer.
-- ----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.register_sale(items jsonb, payment_method text DEFAULT 'dinheiro'::text, installments smallint DEFAULT NULL::smallint, fee_amount numeric DEFAULT 0, discount_amount numeric DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_user          uuid := auth.uid();
  v_sale          uuid;
  v_subtotal      numeric(12,2) := 0;
  v_total         numeric(12,2) := 0;
  v_discount      numeric(12,2);
  v_method        text;
  v_installments  smallint;
  v_fee           numeric(12,2);
  v_pct           numeric(8,4) := 0;
  v_prefs         public.preferences_fees%rowtype;
  v_session       uuid;
  item            jsonb;
  v_qty           numeric(12,3);
  v_price         numeric(12,2);
  v_line          numeric(12,2);
  v_pid           uuid;
  v_name          text;
  v_track         boolean;
  v_cost          numeric(12,2);  -- custo (G1)
begin
  if v_user is null then
    raise exception 'Não autenticado';
  end if;
  if items is null or jsonb_array_length(items) = 0 then
    raise exception 'Venda sem itens';
  end if;

  v_method := coalesce(register_sale.payment_method, 'dinheiro');
  if v_method not in ('dinheiro','pix','debito','credito_avista','credito_parcelado','vale','fiado') then
    raise exception 'Forma de pagamento inválida: %', v_method;
  end if;

  v_installments := case
    when v_method = 'credito_parcelado' then coalesce(register_sale.installments, 2)
    else null
  end;
  -- Achado F: um limite só, igual ao de `lib/caixa/parcelas.ts` (2 a 12).
  if v_installments is not null and (v_installments < 2 or v_installments > 12) then
    raise exception 'Número de parcelas inválido: %', v_installments;
  end if;

  v_discount := round(greatest(coalesce(register_sale.discount_amount, 0), 0), 2);

  -- Vincula à sessão de caixa aberta apenas quando a venda é em dinheiro.
  if v_method = 'dinheiro' then
    select id into v_session
    from public.cash_sessions
    where user_id = v_user and status = 'open'
    limit 1;
  end if;

  -- Achado C: a taxa nasce AQUI, do cadastro do próprio usuário. O
  -- parâmetro `fee_amount` continua na assinatura só para não quebrar um
  -- cliente antigo no meio de um deploy — o valor dele é IGNORADO.
  select * into v_prefs
  from public.preferences_fees
  where user_id = v_user;

  v_pct := case v_method
    when 'pix'               then coalesce(v_prefs.pix_pct, 0)
    when 'debito'            then coalesce(v_prefs.debito_pct, 0)
    when 'credito_avista'    then coalesce(v_prefs.credito_avista_pct, 0)
    when 'credito_parcelado' then coalesce(v_prefs.credito_parcelado_base_pct, 0)
                                  + (v_installments - 1)
                                  * coalesce(v_prefs.credito_parcelado_por_parcela_pct, 0)
    when 'vale'              then coalesce(v_prefs.vale_pct, 0)
    -- Dinheiro não tem taxa; venda a prazo também não: o dinheiro do fiado
    -- entra depois, sem cartão no meio.
    else 0
  end;

  insert into public.sales (user_id, total, status, payment_method, installments, fee_amount, discount_amount, cash_session_id)
  values (v_user, 0, 'completed', v_method, v_installments, 0, 0, v_session)
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
    v_cost  := null;  -- custo (G1): zera a cada item; item avulso fica null
    if v_pid is not null then
      -- custo (G1): lê o custo junto do track_stock (mesma ida ao banco).
      select track_stock, cost_price into v_track, v_cost
      from public.products
      where id = v_pid and user_id = v_user;

      if v_track is null then
        raise exception 'Produto não encontrado';
      end if;
    end if;

    v_line     := round(v_price * v_qty, 2);
    v_subtotal := v_subtotal + v_line;

    insert into public.sale_items
      (sale_id, user_id, product_id, name_snapshot, unit_price, quantity, line_total, unit_cost)
    values
      (v_sale, v_user, v_pid, v_name, v_price, v_qty, v_line, v_cost);

    if v_pid is not null and v_track then
      -- Achado D: SEM `greatest(..., 0)`. O saldo desce o que a venda levou,
      -- ainda que fique negativo, para que somar os movimentos volte a dar
      -- exatamente o saldo.
      update public.products
        set stock_quantity = coalesce(stock_quantity, 0) - v_qty,
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

  -- A taxa incide sobre o que o cliente REALMENTE paga (já com desconto),
  -- que é o mesmo que a tela mostra como estimativa.
  v_fee := case
    when v_total > 0 and v_pct > 0 then round(v_total * v_pct / 100, 2)
    else 0
  end;

  update public.sales
    set total = v_total, discount_amount = v_discount, fee_amount = v_fee
  where id = v_sale;

  return v_sale;
end;
$function$;

comment on function public.register_sale(jsonb, text, smallint, numeric, numeric) is
  'Registra a venda. A TAXA e calculada aqui, de preferences_fees do proprio usuario -- o parametro fee_amount e IGNORADO (achado C). O estoque pode ficar negativo (achado D). Parcelas: 2 a 12, igual a lib/caixa/parcelas.ts (achado F).';
