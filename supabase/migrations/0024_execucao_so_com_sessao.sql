-- =====================================================================
-- GAVETA — 0024: nenhuma funcao do Gaveta e executavel pelo anonimo
-- =====================================================================
-- Achado 6 da varredura de seguranca (docs/12). Defesa em profundidade: a
-- RLS e o auth.uid() ja seguram tudo hoje (medido: products devolve [],
-- register_sale recusa, sales_summary devolve zeros). Esta migration tira o
-- privilegio de EXECUTE de quem nao tem sessao, para o dia em que alguem
-- escrever uma RPC sem checar auth.uid().
--
-- TRES DECISOES QUE NAO DEVEM SER REFEITAS:
--
-- 1. Revoga de PUBLIC **e** de anon. O catalogo mostrava os dois grants ao
--    mesmo tempo (=X/postgres e anon=X/postgres): revogar so de anon nao
--    faria efeito nenhum, porque o privilegio continuaria vindo de PUBLIC.
--
-- 2. NAO toca nas funcoes fiado_*. O projeto Supabase e COMPARTILHADO com o
--    FiadoApp e aquelas quatro funcoes sao dele.
--
-- 3. NAO mexe em "alter default privileges". O privilegio padrao do schema
--    public vale para o papel postgres inteiro, entao mudar ali afetaria
--    tambem as funcoes FUTURAS do FiadoApp, que nao e nosso para quebrar. A
--    regra para as proximas RPCs do Gaveta fica escrita no CLAUDE.md: nasce
--    com revoke de public/anon.
--
-- authenticated e service_role continuam com EXECUTE: e por ali que o app
-- inteiro funciona. As funcoes de GATILHO tambem mantem authenticated --
-- o PostgREST nem as expoe (medido: HTTP 404 PGRST202 em handle_new_user e
-- purchases_guard_update), entao revogar delas nao fecharia porta nenhuma e
-- so arriscaria o caminho do gatilho. A excecao util e o gatilho de EVENTO
-- rls_auto_enable, que o anonimo ALCANCAVA de verdade (HTTP 400 "cannot
-- display a value of type event_trigger", ou seja, passou da porta).
--
-- Aditiva e reversivel: para desfazer, "grant execute on function ... to
-- anon" nas mesmas assinaturas (o retrato das ACLs de antes esta no PR).
-- =====================================================================

revoke execute on function public.add_cash_movement(p_type text, p_amount numeric, p_note text) from public, anon;
revoke execute on function public.adjust_stock(p_product_id uuid, p_mode text, p_quantity numeric) from public, anon;
revoke execute on function public.aplicar_tags_no_produto(p_product uuid, p_tags uuid[], p_new_tags text[]) from public, anon;
revoke execute on function public.close_cash_session(p_counted numeric, p_note text) from public, anon;
revoke execute on function public.data_loja() from public, anon;
revoke execute on function public.editar_compra(p_purchase_id uuid, p_purchase jsonb, p_itens jsonb) from public, anon;
revoke execute on function public.estornar_compra(p_purchase_id uuid) from public, anon;
revoke execute on function public.excluir_venda_fiado(p_venda_id uuid) from public, anon;
revoke execute on function public.expenses_summary(p_from date, p_to date) from public, anon;
revoke execute on function public.fechamento_por_dia(p_from timestamp with time zone, p_to timestamp with time zone, p_tz text) from public, anon;
revoke execute on function public.fechamento_vendas_do_dia(p_dia date, p_from timestamp with time zone, p_to timestamp with time zone, p_tz text) from public, anon;
revoke execute on function public.handle_new_user() from public, anon;
revoke execute on function public.lucro_custo_summary(p_from timestamp with time zone, p_to timestamp with time zone, p_methods text[]) from public, anon;
revoke execute on function public.open_cash_session(p_opening numeric, p_note text) from public, anon;
revoke execute on function public.products_preencher_custo_das_vendas() from public, anon;
revoke execute on function public.produtos_sem_custo(p_from timestamp with time zone, p_to timestamp with time zone, p_methods text[]) from public, anon;
revoke execute on function public.purchase_items_guard_delete() from public, anon;
revoke execute on function public.purchases_guard_update() from public, anon;
revoke execute on function public.register_sale(items jsonb, payment_method text, installments smallint, fee_amount numeric, discount_amount numeric) from public, anon;
revoke execute on function public.registrar_compra(p_purchase jsonb, p_itens jsonb) from public, anon;
revoke execute on function public.registrar_venda_fiado(p_items jsonb, p_itens_fiado jsonb, p_cliente_id uuid, p_cliente jsonb, p_data_vencimento date, p_observacao text) from public, anon;
revoke execute on function public.rls_auto_enable() from public, anon;
revoke execute on function public.sale_items_guard_update() from public, anon;
revoke execute on function public.sales_summary(p_from timestamp with time zone, p_to timestamp with time zone, p_methods text[]) from public, anon;
revoke execute on function public.set_sale_status(p_sale_id uuid, p_status text) from public, anon;
