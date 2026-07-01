-- =====================================================================
-- ERP Simples — 0009: preferências de impressão de comprovante (Fase G)
--
-- Estende profiles com as opções de impressão do comprovante (não fiscal):
--   - receipt_paper:     largura/formato do papel (80mm / 58mm / A4).
--   - receipt_show_logo: exibir a logo da loja no comprovante (se houver).
--   - receipt_show_name: exibir o nome da loja no comprovante.
--   - receipt_footer:    mensagem livre de rodapé (opcional, texto puro).
--
-- profiles já tem RLS ativo e políticas por id = auth.uid() (0001). Tudo
-- aditivo e compatível com a main: colunas com default preservam o
-- comportamento atual.
-- =====================================================================

alter table public.profiles
  add column if not exists receipt_paper text not null default '80mm'
    check (receipt_paper in ('80mm','58mm','a4')),
  add column if not exists receipt_show_logo boolean not null default true,
  add column if not exists receipt_show_name boolean not null default true,
  add column if not exists receipt_footer text
    check (receipt_footer is null or char_length(receipt_footer) <= 120);
