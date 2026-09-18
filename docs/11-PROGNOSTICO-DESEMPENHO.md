# 11 — Prognóstico de desempenho (varredura de 16/09/2026)

Pedido do dono: encontrar onde o sistema perde tempo em todos os
carregamentos, com ênfase na busca de produto por nome na frente de caixa,
**sem perder funcionalidade e sem afrouxar a segurança**. Este documento é o
diagnóstico com as medições que o sustentam; nada foi alterado no código.

## Resumo em uma frase

O sistema não é lento por causa do banco, do JavaScript ou das consultas: ele
é lento porque **a função da Vercel roda em Washington (`iad1`) enquanto o
banco do Supabase fica em São Paulo (`sa-east-1`)** — cada consulta cruza o
continente, e uma tela faz de 6 a 9 consultas em série.

## O que foi medido (e como)

Tudo abaixo foi medido no ambiente real, não deduzido. O script que fez a
medição autenticada está em `scripts/desempenho/` (usuário descartável,
apagado no fim) e pode ser rodado de novo depois de cada mudança.

### 1. Onde cada peça está

| Peça                                                   | Região                     | Como se soube                                        |
| ------------------------------------------------------ | -------------------------- | ---------------------------------------------------- |
| Borda da Vercel que atende o navegador                 | `gru1` (São Paulo)         | cabeçalho `x-vercel-id: gru1::iad1::…`               |
| **Função da Vercel** (páginas, proxy e Server Actions) | **`iad1` (Virgínia, EUA)** | mesmo cabeçalho; é o padrão do projeto sem `regions` |
| Supabase (Postgres, PostgREST e Auth)                  | `sa-east-1` (São Paulo)    | host do pooler `aws-1-sa-east-1.pooler.supabase.com` |

A ida e volta entre Virgínia e São Paulo é de ~120–140 ms. Toda chamada ao
Supabase feita pela função paga isso.

### 2. O banco está rápido

Consulta da busca do caixa executada como o dono (papel `authenticated`, RLS
ativa), plano real:

```
Limit (actual time=0.353..0.355 rows=8)
  -> Sort (top-N heapsort, 26kB)
     -> Index Scan using idx_products_user on products
        Filter: (name ~~* '%co%')  Rows Removed by Filter: 133
        Buffers: shared hit=6
Execution Time: 0.380 ms
```

| Medida                                   | Valor                               |
| ---------------------------------------- | ----------------------------------- |
| Produtos do dono                         | 168 (209 na tabela inteira, 160 kB) |
| Códigos de barras do dono                | 105                                 |
| Tempo de execução da busca por nome      | 0,38 ms                             |
| Busca de código de barras (índice único) | 1,1 ms                              |
| Ida e volta desta máquina ao pooler      | 11 ms                               |

O `ilike '%termo%'` não usa índice de texto, mas com 168 linhas filtradas pelo
índice de `user_id` isso custa 6 páginas de cache. Um índice `pg_trgm` **não
resolveria nada hoje**; só faz sentido acima de dezenas de milhares de
produtos por conta.

### 3. O que o navegador vê em produção (sessão autenticada)

Medido três vezes por tela, com a função já quente (mediana):

| Tela       | TTFB (1º byte) | Carga completa |
| ---------- | -------------- | -------------- |
| Painel     | 1,16 s         | 1,31 s         |
| **Caixa**  | **1,24 s**     | 1,39 s         |
| Produtos   | 1,56 s         | 1,73 s         |
| Estoque    | 1,00 s         | 1,17 s         |
| Financeiro | 0,93 s         | 1,34 s         |

Navegação interna (clique no menu, sem recarregar): Caixa 1,9–2,4 s,
Produtos 0,9–1,4 s, Painel 0,8–1,4 s, Estoque 0,8 s, Financeiro 0,3 s.
Entrar (login → painel): 7,9 s, incluindo partida a frio.

**Busca do caixa** (10 termos, função quente): da última tecla até a lista
aparecer, **mediana 557 ms** (499–632 ms). Desses, 220 ms são a espera
proposital de digitação (`debounce`); a viagem ao servidor fica em
**~300–400 ms**. Com a função fria (depois de alguns minutos sem uso, comum
no plano Hobby), soma-se 1–2 s — foi medido 2,05 s no primeiro acesso contra
0,19 s nos seguintes. É essa combinação que aparece como "alguns segundos"
no momento da venda.

### 4. O JavaScript não é o problema

Build de produção (`next build`): compartilhado por todas as telas 130 KB
gzip; a rota do caixa acrescenta 75 KB gzip (Painel 51, Produtos 63, Estoque
65, Financeiro 69). `jspdf` e `html-to-image` já são carregados sob demanda.
Nada a fazer aqui.

## Por que a busca demora: o caminho de uma tecla

Cada pausa na digitação dispara a Server Action `searchProductsByName`
(`app/(app)/caixa/actions.ts`). O caminho, em série:

1. navegador → borda `gru1` → função em `iad1` (~120 ms);
2. `proxy.ts` → `updateSession` → **`supabase.auth.getUser()`**: uma chamada
   HTTP ao Auth em São Paulo (~130 ms) — em **toda** requisição, inclusive
   cada busca;
3. a ação cria o cliente e consulta o PostgREST em São Paulo (~130 ms);
4. volta ao navegador (~120 ms).

Três travessias continentais em série ≈ 350–400 ms, exatamente o medido. A
consulta em si são 0,4 ms. O `Enter` com código (`findProductByCode`) faz
**três** consultas em série (código → produto → nome), ou seja, mais uma
travessia.

## Por que toda tela demora: a cascata de consultas

Abrir `/caixa` faz, em série, com o cliente do Supabase sendo recriado a
cada passo:

- proxy: `getUser()` (1);
- página: `loadPaymentFees` → `getUser()` (2) → `preferences_fees` (3) →
  **outro** `getUser()` (4) → `cash_sessions` + `ecossistema_prefs` em
  paralelo (5) → `listarTags` (6);
- layout (em paralelo com a página): `getUser()` → `profiles` →
  `ecossistema_prefs` (3 em série).

Seis viagens em série × ~130 ms ≈ 0,8 s, mais a ida do navegador e a
renderização: o 1,24 s de TTFB medido. `getUser()` sozinho roda **quatro
vezes** por abertura do caixa (proxy, layout, `loadPaymentFees` e a página),
e cada uma é uma chamada de rede ao Auth. O mesmo padrão se repete em
Produtos (`listarTags` antes da lista), Painel e Estoque.

## O que fazer, em ordem de retorno por esforço

### A. Levar a função para São Paulo (`gru1`) — config, sem tocar em código

`vercel.json` com `"regions": ["gru1"]` (o plano Hobby permite **uma**
região; também dá para escolher em Settings → Functions no painel). Todas
as viagens ao Supabase caem de ~130 ms para poucos milissegundos.

Efeito esperado: busca do caixa de ~350 ms para **~100–150 ms** de servidor
(a ida do navegador passa a dominar); TTFB das telas de ~1,2 s para
**~0,3–0,4 s**; navegação interna na mesma proporção. Zero mudança
funcional ou de segurança. Conferir depois do deploy pelo `x-vercel-id`
(`gru1::gru1`) e rodar `scripts/desempenho/` de novo.

### B. Cortar a cascata de consultas — código, sem mudança de segurança

1. **Um cliente e um `getUser()` por requisição**: envolver `createClient`
   (e um `obterUsuario()`) em `React.cache()`. Layout, página e ações
   passam a compartilhar o mesmo resultado dentro da mesma requisição.
2. **`loadPaymentFees` não precisa do `getUser()`**: a RLS já restringe a
   linha ao dono (`auth.uid()`); o `.eq("user_id", …)` é redundante.
3. **Paralelizar o que não depende um do outro**: no caixa, taxas + sessão
   aberta + prefs do ecossistema + tags num único `Promise.all`; no layout,
   `profiles` + `ecossistema_prefs` juntos; em Produtos, tags + lista juntos.
   O caixa vai de 6 viagens em série para 2 (proxy + um lote paralelo).
4. `findProductByCode`: disparar a busca por código e por nome em paralelo
   (ou uma RPC única), em vez de três em série.

Sozinho, o item B tira ~500 ms da abertura do caixa hoje; combinado com A, o
ganho absoluto é menor, mas é o que impede a cascata de voltar a crescer.

### C. Validar a sessão sem ir ao Auth a cada requisição — decisão de segurança do dono

Fato medido: o projeto Supabase **já assina os tokens com chave assimétrica**
(`alg: ES256`, JWKS publicado em `/auth/v1/.well-known/jwks.json`), e o
`@supabase/supabase-js` 2.108 traz `auth.getClaims()`, que **verifica a
assinatura localmente** com o JWKS (cache global por instância, 10 min).
Trocar `getUser()` por `getClaims()` **no `proxy.ts`** elimina a viagem ao
Auth em toda requisição — páginas, navegação interna e cada busca do caixa.

Não é `getSession()` (que não verifica nada): a assinatura é conferida
criptograficamente, é o que a própria Supabase recomenda para middleware com
chaves assimétricas, e a RLS no banco continua validando o token em toda
consulta. O que muda: um token de sessão **revogada** (logout em outro
aparelho, usuário apagado) continua aceito pelo proxy até expirar — o prazo
padrão é 1 h, ajustável no painel do Supabase. Recomendação: fazer a troca
**só no proxy** e manter o `getUser()` do layout, que é uma chamada por
página e continua consultando o Auth. Isso pede atualizar a regra 3 do
`CLAUDE.md` ("nunca confiar em `getSession()`" continua; `getClaims()` entra
como aceito no proxy). **Só com o "pode" do dono.**

### D. Ganhos pequenos e opcionais na própria busca

- Guardar no cliente os resultados já vistos na sessão (`Map` termo →
  lista): voltar a digitar "co" não vai ao servidor. Sem risco: o dado já
  foi entregue a esse usuário.
- O `debounce` de 220 ms está bom; reduzir pouco muda e aumenta chamadas.
- **Não recomendado agora**: baixar o catálogo inteiro para buscar no
  navegador. Faria a busca instantânea, mas muda a dinâmica (preço alterado
  em outro aparelho demora a aparecer) — só se, depois de A e B, ainda
  incomodar.

### E. O que não vale mexer

- Índice `pg_trgm`: irrelevante nesta escala (ver §2).
- Bundle do cliente: já enxuto (§4).
- Partida a frio: é do plano Hobby; sem concorrência provisionada não há
  saída gratuita. A e B reduzem o que vem **depois** da partida, que é a
  parte maior.

## Ordem sugerida de execução

1. **PR 1 — região** (`vercel.json`, uma linha). Medir antes/depois com
   `scripts/desempenho/`. Preview já roda na região nova.
2. **PR 2 — cascata** (item B), com os testes de sempre; sem migration.
3. **Decisão do dono sobre C**; se sim, PR 3 só no `proxy.ts` + CLAUDE.md.
4. Repetir a medição e registrar os números aqui.

## Números de referência para comparar depois

Busca do caixa 557 ms (última tecla → lista) · TTFB caixa 1,24 s · TTFB
produtos 1,56 s · navegação interna para o caixa 1,9–2,4 s · região
`gru1::iad1`.

## Resultado (mesmo dia, 16/09/2026) — os três itens entregues

| PR  | Item                                                                                   | Merge     |
| --- | -------------------------------------------------------------------------------------- | --------- |
| #48 | A — função em `gru1` (`vercel.json`)                                                   | `e39bd56` |
| #49 | B — uma validação por requisição (`React.cache`) e consultas em paralelo               | `307338d` |
| #50 | C — `getClaims()` no proxy; `getUser()` no layout e, com estado, em `/login`/`/signup` | `75869fc` |

Medido em produção com o mesmo script, mesma máquina, função quente
(mediana de 3 cargas por tela e de 10 buscas):

| Medida                               | Antes        | Só #48       | #48 + #49 + #50 |
| ------------------------------------ | ------------ | ------------ | --------------- |
| Busca do caixa, última tecla → lista | 557 ms       | 281 ms       | **BUSCA**       |
| TTFB do caixa                        | 1,24 s       | 0,26 s       | **CAIXA**       |
| TTFB de produtos                     | 1,56 s       | 0,26 s       | **PRODUTOS**    |
| TTFB do painel                       | 1,16 s       | 0,23 s       | **PAINEL**      |
| TTFB do estoque                      | 1,00 s       | 0,28 s       | **ESTOQUE**     |
| TTFB do financeiro                   | 0,93 s       | 0,26 s       | **FINANCEIRO**  |
| Navegação interna para o caixa       | 1,9–2,4 s    | 0,85 s       | **NAV**         |
| Login → painel                       | 7,9 s        | 2,5 s        | **LOGIN**       |
| Região (`x-vercel-id`)               | `gru1::iad1` | `gru1::gru1` | `gru1::gru1`    |

Dos ~260 ms da busca, 220 ms são o `debounce` proposital: a viagem ao
servidor ficou em ~40 ms. O que resta é a partida a frio do plano Hobby
(1–2 s depois de alguns minutos sem uso), que nenhuma das três mudanças
toca — mas o que vem depois dela caiu de ~1,2 s para ~0,2 s.

A navegação interna (clique no menu) ainda alterna entre ~0,35 s e ~0,85 s
com o mesmo servidor respondendo em ~0,15 s. **Hipótese, não medida:** a
coreografia do cliente — o loader que espera 400 ms para aparecer e o `template.tsx` com fade de 300 ms — e não o servidor. Se incomodar, é o
próximo lugar para medir.

### O que a entrega do item C ensinou

A prova da garantia de segurança (apagar as sessões no Auth com o cookie
intacto) revelou um laço: o layout mandava para `/login`, o proxy via
assinatura válida e devolvia para `/dashboard`, e o navegador parava em
`ERR_TOO_MANY_REDIRECTS`. Ninguém entrava, mas a tela de entrar não
aparecia. Corrigido no próprio PR: em `/login` e `/signup` o proxy confere
com estado e limpa os cookies mortos. **A suíte e2e não pegou isso** — só a
prova dedicada pegou. Fica a lição: mudança em autenticação pede prova do
cenário de revogação, não só dos cenários felizes.

## Abertura do app instalado no celular (18/09/2026) — PR #59, `398229d`

O dono relatou o **app instalado demorando para abrir**. Medido num Pixel 7
emulado, com **CPU 4× mais lenta e 4G a 150 ms de latência**, sessão já
iniciada e cache quente.

### Onde o tempo estava

| Caminho de abertura    | Mediana |
| ---------------------- | ------- |
| `start_url` era a raiz | 874 ms  |
| direto em `/dashboard` | 596 ms  |

Decomposição de uma abertura:

| Fase                      | Mediana |
| ------------------------- | ------- |
| Espera do servidor (TTFB) | 196 ms  |
| Baixar o HTML (55 KB)     | 3 ms    |
| Montar o DOM              | 77 ms   |
| Primeiro desenho          | 268 ms  |
| Load completo             | 556 ms  |

**A leitura que importa:** a latência emulada é de 150 ms, então o servidor
responde em **~46 ms**. No celular o que custa caro não é o servidor, é cada
**ida e volta de rede** — e o `start_url` gastava uma inteira só para ouvir
"vá para o painel".

### O que mudou

1. **`start_url` passou a ser `/dashboard`**, com `"id": "/"` junto. Sem o
   `id`, mudar o `start_url` faria o Chrome tratar como um app diferente e
   o ícone instalado viraria outro app.
2. **A raiz é resolvida no proxy**, com a sessão que aquela requisição já
   verificou. Antes ela renderizava uma página que chamava o Auth de novo só
   para responder um redirecionamento. Isso é o que alcança o **app Android
   (TWA)**, que tem a URL de abertura gravada dentro dele e continua
   entrando pela raiz.
3. **O service worker parou de interceptar tudo.** O handler continua
   existindo, que é o que mantém o app instalável, mas não chama
   `respondWith`.
4. **As logos viraram import estático**, ganhando URL com hash e
   `max-age=31536000, immutable`. Antes o otimizador respondia
   `max-age=0` e o navegador perguntava por elas a cada abertura.

### Três coisas medidas e DESCARTADAS

- **O prefetch do menu não é o vilão.** Toda abertura dispara **11
  prefetches**, um por tela, duas vezes cada. Parecia o culpado óbvio; não
  é: 603 ms com prefetch contra 622 ms sem, e a troca de tela ficou igual.
  Fica como está — e ainda ajuda, porque mantém a função quente no Hobby.
- **Cache dos arquivos de `/public`**: nenhum deles é pedido na abertura.
  Mexer ali não traria nada.
- **`images.minimumCacheTTL` e regra de `headers()` para `/_next/image`**:
  nenhuma das duas muda o `Cache-Control` que chega ao navegador — quem
  responde aquele cabeçalho é o otimizador. Foram removidas depois de
  medidas. Quem resolveu foi o import estático.

### O que sobra, e é do plano

A **partida a frio** do plano Hobby continua somando 1 a 2 s quando o app
fica horas sem uso — é o que aparece como lentidão na primeira abertura do
dia. Não há saída gratuita: o cron da Vercel no Hobby roda uma vez por dia,
então não serve para manter a função quente.
