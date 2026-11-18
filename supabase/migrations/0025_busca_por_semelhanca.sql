-- =====================================================================
-- GAVETA — 0025: busca de produto que perdoa erro de digitacao
-- =====================================================================
-- Pedido do dono (18/11/2026): a busca tem de achar o registro "de alguma
-- forma", com ou sem acento e mesmo com erro de digitacao -- "aroz" acha
-- "Arroz", "biscoto" acha "Biscoito". Ele autorizou instalar o que fosse
-- preciso.
--
-- O filtro EXATO (cada palavra no nome, sem acento) continua no app, em
-- `lib/db/busca.ts`, com `imatch` do PostgREST. Esta migration acrescenta
-- o PARECIDO: uma RPC que devolve os produtos com nome semelhante ao que se
-- digitou, por trigramas (pg_trgm), sem acento (unaccent). Ela so PRE-
-- SELECIONA (limiar frouxo, 0,3); quem decide o que e parecido de verdade
-- e a regra de distancia de edicao em `lib/db/busca.ts`, a mesma que o
-- FiadoApp usa.
--
-- DECISOES:
--
-- 1. Extensoes no schema `extensions`, como manda o Supabase -- nada de
--    objeto de extensao no `public`, que o PostgREST expoe.
-- 2. `unaccent()` e STABLE (depende do dicionario) e indice so aceita
--    funcao IMMUTABLE. `texto_de_busca` fixa o dicionario pelo nome
--    qualificado -- e o jeito documentado de indexar texto sem acento.
-- 3. A RPC e SECURITY INVOKER: roda como quem chama, e a RLS de `products`
--    continua sendo a fronteira. Devolve `setof products` para o app poder
--    pedir as mesmas colunas e embeds (codigos, categorias) da listagem.
-- 4. Nasce sem o papel anonimo (regra 5.1 do CLAUDE.md): revoke de
--    `public` E `anon`, que revogar so de anon nao tem efeito.
-- 5. So leitura e so do Gaveta: nao toca em tabela nem funcao do FiadoApp.
--    A busca de cliente do fiado e feita em memoria, nos dois apps.
-- =====================================================================

create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create or replace function public.texto_de_busca(p_texto text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, p_texto));
$$;

-- Indice de trigramas sobre o nome ja sem acento: e o que a RPC consulta.
create index if not exists products_nome_busca_trgm
  on public.products
  using gin (public.texto_de_busca(name) extensions.gin_trgm_ops);

-- Os 60 produtos de nome mais parecido com a busca. `<%` e a "semelhanca
-- de palavra" do pg_trgm: compara a busca com o PEDACO mais parecido do
-- nome, que e o caso de quem digita uma palavra so de um nome comprido.
create or replace function public.produtos_parecidos(p_busca text)
returns setof public.products
language sql
stable
security invoker
set search_path = ''
set pg_trgm.word_similarity_threshold = 0.3
as $$
  select p.*
  from public.products p
  where public.texto_de_busca(p_busca)
        operator(extensions.<%) public.texto_de_busca(p.name)
  order by extensions.word_similarity(
             public.texto_de_busca(p_busca),
             public.texto_de_busca(p.name)
           ) desc,
           p.name
  limit 60;
$$;

revoke execute on function public.texto_de_busca(text) from public, anon;
revoke execute on function public.produtos_parecidos(text) from public, anon;
