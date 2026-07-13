-- =====================================================================
-- ERP Simples — 0012: exclusão consistente da venda a prazo (Ecossistema
-- F6, Fase 3)
--
-- ⚠️ Banco COMPARTILHADO com o FiadoApp. RPC-ponte de EXCLUSÃO: remove, numa
-- única transação, os DOIS lados de uma venda a prazo, para que excluir em
-- qualquer app a tire dos registros/relatórios do outro.
--
--   1. Estorna+remove a venda do Gaveta ligada (sales.fiado_venda_id):
--      reutiliza set_sale_status(..,'voided') para DEVOLVER o estoque (mesma
--      lógica testada, sem drift) e então apaga a venda — sale_items
--      cascateia; stock_movements viram sale_id null (histórico preservado).
--   2. Apaga a venda a prazo no FiadoApp (fiado_vendas) — cascateia itens e
--      pagamentos.
--
-- Chamada pelo FiadoApp (excluir venda/cliente de origem 'gaveta') e pelo
-- próprio Gaveta (bloco "A receber via FiadoApp"). A trava para vendas já
-- pagas é da UI (confirmação sinaliza) — a RPC executa a exclusão pedida.
-- Aditiva: função nova, nada existente muda.
-- =====================================================================

create or replace function public.excluir_venda_fiado(p_venda_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  s      record;
begin
  if v_user is null then
    raise exception 'Não autenticado';
  end if;

  -- 1) Venda(s) do Gaveta ligada(s) a esta venda a prazo (normalmente 1).
  for s in
    select id, status
    from public.sales
    where fiado_venda_id = p_venda_id and user_id = v_user
  loop
    -- Estorno devolve o estoque (só se ainda estava 'completed').
    if s.status = 'completed' then
      perform public.set_sale_status(s.id, 'voided');
    end if;
    delete from public.sales where id = s.id and user_id = v_user;
  end loop;

  -- 2) Venda a prazo no FiadoApp (cascade: itens + pagamentos).
  delete from public.fiado_vendas
  where id = p_venda_id and user_id = v_user;
end;
$$;
