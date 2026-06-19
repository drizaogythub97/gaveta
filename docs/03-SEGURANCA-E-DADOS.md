# 03 — Segurança e Modelo de Dados

Segurança é requisito inegociável. Este documento define o modelo de dados, o isolamento entre usuários (RLS), as fases de segurança e a postura de proteção de dados (LGPD).

## Princípios de segurança

1. **Isolamento no nível do banco (defense-in-depth).** Mesmo que a aplicação tenha um bug, o PostgreSQL recusa acesso a dados de outro usuário via RLS.
2. **Default-deny.** Toda tabela com RLS ativo e sem política retorna zero linhas. Só liberamos o estritamente necessário.
3. **Segredos no servidor.** A `service_role key` nunca vai ao navegador. No cliente usamos apenas a chave publicável (anon), sempre sujeita ao RLS.
4. **Validar no servidor.** Toda entrada é validada também no servidor (nunca confiar só no cliente).
5. **Menor coleta possível.** Só pedimos o dado pessoal necessário (e-mail). Sem dados sensíveis.

## Modelo de dados

Quatro tabelas. Toda tabela de negócio carrega `user_id` (dono dos dados) para o RLS.

### `profiles`
Espelha o usuário autenticado (vinculado a `auth.users`). Criado por trigger no signup.
- `id` (uuid, PK, = `auth.users.id`)
- `full_name` (text, opcional)
- `privacy_accepted_at` (timestamptz) — registro do aceite da política (LGPD)
- `created_at` (timestamptz)

### `products`
- `id` (uuid, PK)
- `user_id` (uuid, FK → auth.users) — **dono**
- `name` (text, obrigatório)
- `barcode` (text, **opcional / nullable**) — código de barras; nem todo produto é industrializado, então pode ficar vazio. Único por usuário quando informado.
- `price` (numeric(12,2), ≥ 0)
- `track_stock` (boolean, default `true`) — quando `false`, o produto **não controla quantidade** (ex.: marmitas, produção sob demanda). Vendas desses itens **não** baixam estoque.
- `stock_quantity` (numeric(12,3), **nullable**) — quantidade em estoque; pode ser nula quando `track_stock = false`. Restrição garante que, se `track_stock = true`, a quantidade exista.
- `created_at` (timestamptz) — usado no filtro "data de inclusão"
- `updated_at` (timestamptz)
- Índices: `(user_id)`, `(user_id, name)` para busca; índice único parcial `(user_id, barcode)` para leitura por código de barras.

### `sales`
- `id` (uuid, PK)
- `user_id` (uuid, FK) — **dono**
- `total` (numeric(12,2))
- `created_at` (timestamptz) — usado nos filtros de período
- `status` (text: `completed` | `voided`) — permite estorno reversível

### `sale_items`
- `id` (uuid, PK)
- `sale_id` (uuid, FK → sales)
- `user_id` (uuid, FK) — **dono** (redundante, mas simplifica RLS)
- `product_id` (uuid, FK → products, **nullable** — null = item avulso)
- `name_snapshot` (text) — nome no momento da venda (histórico íntegro)
- `unit_price` (numeric(12,2))
- `quantity` (numeric(12,3))
- `line_total` (numeric(12,2))

> O SQL completo (DDL + RLS + funções) está em [`/supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql).

## Isolamento entre usuários (RLS)

Padrão aplicado a `products`, `sales`, `sale_items` (e `profiles` com `id = auth.uid()`):

```sql
alter table products enable row level security;

create policy "select_own" on products
  for select using (auth.uid() = user_id);
create policy "insert_own" on products
  for insert with check (auth.uid() = user_id);
create policy "update_own" on products
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete_own" on products
  for delete using (auth.uid() = user_id);
```

Resultado: cada usuário só lê/escreve/edita/apaga as próprias linhas. Tentativas de acessar dados de outro usuário retornam vazio — garantido pelo banco.

## Registro de venda (transação atômica)

Para evitar venda gravada sem baixa de estoque (ou vice-versa), o registro usa uma **função PostgreSQL (RPC) transacional**: cria a `sale`, insere os `sale_items` e decrementa o `stock_quantity` dos produtos cadastrados — tudo ou nada. Detalhes no SQL da migração.

## Fases de segurança

Implementadas principalmente na **Fase 7** do roadmap, mas com sementes desde a Fase 1.

### S1 — Autenticação robusta
- Supabase Auth (hashing de senha gerenciado, tokens rotativos).
- Política de senha mínima (comprimento, complexidade) na tela de cadastro.
- Recuperação de senha por e-mail.
- Sempre `supabase.auth.getUser()` para proteger rotas (nunca confiar em `getSession()` no servidor).

### S2 — Isolamento de dados (RLS)
- RLS ativo em todas as tabelas, políticas por `user_id`.
- Testes automatizados: criar 2 usuários, garantir que A não enxerga dados de B.

### S3 — Validação e sanitização de entrada
- Schemas **Zod** validando no cliente **e** no servidor (Server Actions / Route Handlers).
- Conversão/checagem de tipos numéricos (preço, quantidade ≥ 0).
- Escapar saída para evitar XSS (React já ajuda, mas validar conteúdo dinâmico).

### S4 — Proteção da camada web
- Headers de segurança via `next.config`/middleware: `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`.
- Proteção CSRF nas mutações; cookies `HttpOnly`, `Secure`, `SameSite`.
- **Rate limiting** em login/cadastro/recuperação (ex.: limite por IP) para mitigar força bruta.

### S5 — Gestão de segredos
- `.env.local` fora do Git (já no `.gitignore`).
- `service_role key` só no servidor.
- Variáveis configuradas no painel da Vercel (não no código).

### S6 — Tratamento de erros e logs
- Mensagens de erro genéricas ao usuário (não vazar stack/SQL).
- Não logar dados pessoais nem segredos.

### S7 — Revisão final
- Rodar `/security-review` no Claude Code sobre o diff.
- Conferir alertas de RLS do próprio Supabase (ele avisa tabelas sem RLS).
- Checklist OWASP básico (injeção, auth quebrada, exposição de dados, configuração incorreta).

## LGPD — proteção de dados pessoais

- **Base legal & minimização:** coletamos apenas o e-mail (necessário para login). Nenhum dado sensível.
- **Consentimento:** aceite **obrigatório** da [Política de Privacidade](./04-POLITICA-PRIVACIDADE.md) no cadastro, com data registrada em `profiles.privacy_accepted_at`.
- **Direito de exclusão:** funcionalidade "Excluir minha conta" que apaga o usuário e, em cascata, todos os seus dados.
- **Transparência:** política em linguagem simples, acessível a partir do login e do cadastro.
- **Segurança do tratamento:** criptografia em trânsito (HTTPS) e em repouso (Supabase), isolamento por RLS.

## Backup (compensando o plano gratuito)

O plano gratuito do Supabase **não tem backup automático**. Mitigações documentadas para a Fase 8:
- Script/checklist de **export periódico** (dump do banco via painel ou CLI do Supabase).
- Orientação ao usuário para manter o projeto ativo (evitar pausa por inatividade — que **não apaga** dados, mas deixa o banco indisponível até "restore").
