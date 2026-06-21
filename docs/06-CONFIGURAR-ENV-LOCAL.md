# 06 — Como reconstruir o `.env.local` (passo a passo)

> **Quando usar este guia:** você perdeu o `.env.local` (ex.: formatou o PC) e
> precisa recriá-lo para o projeto voltar a rodar localmente. O `.env.local`
> **nunca** vai para o Git (está no `.gitignore`), então não dá para
> "recuperar do repositório" — você reconstrói a partir do **painel do
> Supabase** (fonte da verdade) ou do seu **backup no Google Drive**.

---

## 0. Resumo de 30 segundos

O `.env.local` na raiz do projeto precisa de **4 variáveis**:

| Variável | O que é | Pode ir ao navegador? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do seu projeto Supabase | Sim (pública) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave **publishable / anon** | Sim (pública, sujeita ao RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave **secret / service_role** | **NÃO — é uma senha** |
| `NEXT_PUBLIC_SITE_URL` | URL base da app (em dev: `http://localhost:3000`) | Sim |

As 3 primeiras vêm do painel do Supabase. A última, em desenvolvimento, é
sempre `http://localhost:3000` (em produção vira a URL da Vercel — isso é a
Fase 6, não mexa agora).

---

## 1. Crie o arquivo a partir do template

O repositório já tem um `.env.example` com a estrutura. O jeito mais seguro é
copiá-lo e preencher.

No PowerShell, na raiz do projeto (`C:\Users\adria\Documents\erp-simples`):

```powershell
Copy-Item .env.example .env.local
```

Isso cria o `.env.local` com os placeholders. Agora é só substituir os
`xxxxxxxx` pelos valores reais (passos 2 e 3). O arquivo final fica assim:

```env
NEXT_PUBLIC_SUPABASE_URL="https://SEU-PROJETO.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="sb_publishable_xxxxxxxxxxxxxxxxxxxx"
SUPABASE_SERVICE_ROLE_KEY="sb_secret_xxxxxxxxxxxxxxxxxxxx"
NEXT_PUBLIC_SITE_URL="http://localhost:3000"
```

> ⚠️ **Não** apague as aspas e **não** deixe espaços em volta do `=`.
> Cada variável em uma linha. Linhas começando com `#` são comentários.

---

## 2. Pegar os valores no painel do Supabase (fonte da verdade)

Acesse **https://supabase.com/dashboard**, entre com o **GitHub** (foi assim
que a conta foi criada) e abra o projeto **`erp-simples`**.

### 2.1 — `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`

1. No menu lateral, clique na **engrenagem (Project Settings)**.
2. Vá em **Data API** (ou **API**, dependendo da versão do painel).
3. Copie:
   - **Project URL** → cole em `NEXT_PUBLIC_SUPABASE_URL`
     (formato `https://abcdefgh.supabase.co`).
   - **anon / publishable key** → cole em `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

### 2.2 — `SUPABASE_SERVICE_ROLE_KEY` (a chave secreta)

1. Ainda em **Project Settings**, vá em **API Keys**.
2. Copie a **secret / service_role key** → cole em `SUPABASE_SERVICE_ROLE_KEY`.
3. **Trate como senha.** Nunca exponha, nunca prefixe com `NEXT_PUBLIC_`,
   nunca cole em mensagem/chat/print público.

> **Sobre os dois formatos de chave (importante).** O Supabase migrou o
> formato das chaves. Você pode encontrar:
> - **Formato novo:** `sb_publishable_...` (anon) e `sb_secret_...` (service_role).
> - **Formato legado (JWT):** strings longas começando com `eyJ...`. A "anon
>   public" legada vai em `NEXT_PUBLIC_SUPABASE_ANON_KEY`; a "service_role"
>   legada vai em `SUPABASE_SERVICE_ROLE_KEY`.
>
> **Os dois formatos funcionam** com a stack do projeto (`@supabase/ssr`).
> Use o que o seu painel mostrar. Se aparecerem ambos, prefira o formato novo
> (`sb_publishable_` / `sb_secret_`).

---

## 3. Onde procurar no seu backup do Google Drive

Se você salvou o `.env.local` (ou as chaves soltas) no Drive antes de formatar,
isso poupa as idas ao painel. Procure por:

- Um arquivo chamado **`.env.local`**, `env.txt`, `erp-simples env`,
  `chaves supabase`, `segredos erp` ou similar.
- Busca por **conteúdo** no Drive (a busca do Drive lê dentro de arquivos
  `.txt`/Docs): pesquise por `NEXT_PUBLIC_SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `supabase.co` ou `sb_secret_`.
- Confira a **Lixeira** do Drive caso tenha apagado sem querer.

> ✅ **Validação cruzada:** mesmo que o Drive tenha as chaves, vale conferir
> com o painel (§2). Se você já **rotacionou/regerou** alguma chave depois do
> backup, o valor do Drive estará desatualizado — nesse caso o painel manda.
>
> ❓ Se quiser, posso te ajudar a buscar esse backup no Google Drive na próxima
> sessão (tenho integração com o Drive disponível) — é só me autorizar e dizer
> o nome aproximado do arquivo. Eu **não** acesso seu Drive sem você pedir.

---

## 4. (Opcional, mas recomendado) Se você não tiver mais a chave secreta

Se a `service_role` se perdeu e não está no Drive, **gere uma nova** no painel:

1. **Project Settings → API Keys**.
2. Use a opção de **reset / roll / generate new** da secret key (o rótulo
   varia conforme a versão do painel).
3. Copie a nova e cole no `.env.local`.

> A `anon/publishable` e a `Project URL` **não mudam** ao resetar a secret —
> só a secret é substituída. Depois de rotacionar, qualquer lugar que use a
> chave antiga (ex.: variáveis na Vercel, quando chegar a Fase 6) precisa ser
> atualizado.

---

## 5. Verifique se ficou certo

Com o `.env.local` preenchido, na raiz do projeto:

```powershell
npm run dev
```

Abra **http://localhost:3000**. Se a tela de login carregar e você conseguir
logar/cadastrar, as 3 chaves públicas estão corretas.

Para validar **também** a `service_role` (que só é usada no servidor — em
testes RLS e na exclusão de conta), rode os testes de RLS:

```powershell
npm run test:rls
```

Se passarem (5 testes, ~2s), a `SUPABASE_SERVICE_ROLE_KEY` está válida.

| Sintoma | Causa provável |
|---|---|
| App nem sobe / erro "Variavel de ambiente ... ausente" | Faltou uma das 4 variáveis ou nome digitado errado |
| Login não funciona / erro de auth | `NEXT_PUBLIC_SUPABASE_URL` ou `ANON_KEY` errada |
| `npm run test:rls` falha logo no setup | `SUPABASE_SERVICE_ROLE_KEY` ausente ou incorreta |

---

## 6. Regras de segurança (não pule)

- **Nunca** commite o `.env.local`. Ele já está no `.gitignore`; confirme com
  `git status` que ele **não** aparece como arquivo a ser adicionado.
- A `service_role` é **uma senha de administrador do banco** — ela ignora o
  RLS. Se vazar, qualquer pessoa lê/escreve todos os dados de todos os
  usuários. Se desconfiar de vazamento, **rotacione** imediatamente (§4).
- Em produção (Fase 6), essas variáveis **não** vão em arquivo: vão no painel
  da Vercel (Settings → Environment Variables), e o `NEXT_PUBLIC_SITE_URL`
  passa a apontar para o domínio da Vercel.

---

## 7. Conteúdo final esperado do `.env.local`

```env
# URL pública do projeto Supabase (Project Settings > Data API)
NEXT_PUBLIC_SUPABASE_URL="https://SEU-PROJETO.supabase.co"

# Chave publicável (publishable / anon) — pode ir para o navegador
NEXT_PUBLIC_SUPABASE_ANON_KEY="sb_publishable_xxxxxxxxxxxxxxxxxxxx"

# Chave secreta (service_role / secret) — USO EXCLUSIVO NO SERVIDOR.
SUPABASE_SERVICE_ROLE_KEY="sb_secret_xxxxxxxxxxxxxxxxxxxx"

# URL base da aplicação — em desenvolvimento é sempre localhost:3000
NEXT_PUBLIC_SITE_URL="http://localhost:3000"
```

Pronto. Com isso o projeto roda localmente de novo e você está apto a seguir
para a **Fase 6 (Deploy)** na próxima sessão.
