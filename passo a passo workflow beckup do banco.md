# Passo a passo — fazer o backup do banco voltar a funcionar

> Documento operacional para o **dono** executar. Nenhum valor de segredo
> aparece aqui, nem deve ser colado em conversa com o agente.
> Escrito em 2026-09-02; **caminhos do painel do Supabase revisados em
> 2026-09-03** (o painel mudou — ver o aviso no passo 1).
> Workflow: `.github/workflows/backup-db.yml`.
> Procedimento de restauração: `docs/06-QUALIDADE-FASE8.md`.

---

## Resumo em uma linha

O secret `SUPABASE_DB_URL` do repositório **não está no formato de URI**
(`postgresql://…`). Regravar esse secret com a connection string completa do
**Session pooler** do Supabase resolve. Leva uns 10 minutos.

---

## Situação atual (medida, não suposta)

- O backup falha em **toda** execução agendada desde **2026-06-28**.
- Último backup bom: **2026-06-25**. Ou seja, o sistema está em produção,
  com 4 contas reais, **sem cópia há mais de dois meses**.
- Conferido de novo em **2026-09-03**: as cinco últimas execuções agendadas
  (02/08, 09/08, 16/08, 23/08 e 30/08) falharam, todas em ~15 segundos.
- Última execução (30/08, id `33302008301`) morreu com:

  ```
  pg_dump: error: connection to server on socket
  "/var/run/postgresql/.s.PGSQL.5432" failed: No such file or directory
  ```

- Os dois secrets existem no repositório:

  | Secret | Última gravação |
  |---|---|
  | `BACKUP_PASSPHRASE` | 2026-06-25 |
  | `SUPABASE_DB_URL`   | 2026-06-26 |

### Por que isso prova o diagnóstico

1. O workflow tem um *guard* que aborta com mensagem própria se o secret
   estiver vazio. Ele **passou** → o secret existe e tem conteúdo.
2. O `pg_dump` só tenta o **socket local** (`/var/run/postgresql/…`) quando o
   que recebeu **não parece uma URI**. Nesse caso ele trata o texto como
   *nome de banco* e procura um Postgres dentro do próprio runner — que não
   existe. Não é problema de rede, de senha, nem de firewall do Supabase.
3. O `BACKUP_PASSPHRASE` é de **25/06** (dia do último backup verde) e o
   `SUPABASE_DB_URL` é de **26/06** — o dia seguinte, quando quebrou.

**Causas prováveis do formato errado** (a mais comum é a primeira):

- o valor foi colado **entre aspas** (`"postgresql://…"`), e o GitHub guarda
  as aspas como parte do segredo;
- foi colado só o host, ou o formato `psql -h … -U …`, em vez da URI;
- sobrou quebra de linha ou espaço no fim;
- a senha dentro da URI tem caractere especial **não codificado** (ver passo 4).

---

## Passo 1 — Pegar a connection string certa no Supabase

> ⚠️ **O painel do Supabase mudou de lugar** (conferido em 2026-09-03). A
> antiga trilha *Project Settings → Database → Connection string* **não existe
> mais**: agora as strings de conexão saem do botão **Connect**, no topo da
> página do projeto. Os links abaixo já vão direto, sem precisar navegar.

### 1.1 — Link direto para a string do Session pooler

Abrir este link (já entra no projeto certo, já abre o painel **Connect** e já
seleciona o modo **Session pooler**):

<https://supabase.com/dashboard/project/jipavekxqsbzslcqpxmb/?showConnect=true&method=session>

⚠️ Esse é o projeto **compartilhado com o FiadoApp**. Só copiar a string; não
mexer em mais nada.

Se o link cair na página do projeto sem abrir a janela, é porque o painel
lembrou outra aba. Nesse caso: botão **Connect** (topo da página, perto do
nome do projeto) → seção **Session pooler**.

### 1.2 — Conferir que é o modo certo

O painel oferece três modos. Só um serve aqui:

| Modo | Porta | Serve? | Por quê |
|---|---|---|---|
| Direct connection | 5432 | ❌ | É **IPv6**, e o runner do GitHub Actions não tem IPv6 |
| Transaction pooler | 6543 | ❌ | Não aguenta o `pg_dump` |
| **Session pooler** | **5432** | ✅ | IPv4, é o que funciona aqui |

### 1.3 — Conferir a cara da string

Copiar a string inteira (há um botão de copiar ao lado). Ela tem esta forma —
o **usuário e o final já são os do seu projeto**, então dá para conferir letra
por letra:

```
postgresql://postgres.jipavekxqsbzslcqpxmb:[YOUR-PASSWORD]@aws-1-sa-east-1.pooler.supabase.com:5432/postgres
```

Checklist rápido, olhando a **sua**:

- começa com `postgresql://` (se o painel entregar `postgres://`, também vale —
  o que **não** vale é começar com outra coisa)
- o usuário é exatamente `postgres.jipavekxqsbzslcqpxmb`
- o host termina em `.pooler.supabase.com` — o pedaço do meio
  (`aws-1-sa-east-1`, `aws-0-sa-east-1`, outra região…) é o que o painel
  mostrar; **não invente, copie**
- a porta é `:5432` (se vier `:6543`, você pegou o Transaction pooler)
- termina em `/postgres`

## Passo 2 — Trocar `[YOUR-PASSWORD]` pela senha real do banco

O painel entrega a string com o marcador `[YOUR-PASSWORD]`. Substituir esse
trecho **inteiro** (inclusive os colchetes) pela senha do banco.

A senha **não aparece em lugar nenhum do painel** — ela só é mostrada uma vez,
quando é criada. Se você não a tem em mãos, o caminho é gerar uma nova:

### Link direto para o reset da senha

<https://supabase.com/dashboard/project/jipavekxqsbzslcqpxmb/database/settings>

Nessa página, seção **Database password** → botão **Reset database password**.

> ℹ️ Esta página também mudou de endereço: era `/settings/database` e agora é
> `/database/settings` (no menu lateral: **Database** → **Settings**, e não
> mais a engrenagem de *Project Settings*). O endereço antigo costuma
> redirecionar, mas se der 404 é por isso.

> ⚠️ Se você resetar a senha, o `SUPABASE_DB_URL` do seu `.env.local` (usado
> para aplicar migrations) também precisa ser atualizado com a senha nova, ou
> os scripts de migration param de conectar. O `.env.local` fica na raiz do
> projeto, em `C:\Users\adria\Documents\gaveta`.
>
> ⚠️ E se o **FiadoApp** também usar a senha do banco em algum `.env` ou na
> Vercel, ele quebra junto. Vale conferir antes de resetar.
>
> ⏱️ O reset leva cerca de **1 minuto** para propagar no pooler. Se testar
> antes disso e falhar autenticação, esperar e tentar de novo.

**Dica que evita o passo 4 inteiro:** ao gerar a senha nova, use uma senha
longa **só com letras e números**. Aí não há caractere para codificar.

## Passo 3 — Testar ANTES de gravar (opcional, mas evita uma volta)

Vale a pena provar a string antes de virar secret — senão o erro só aparece na
próxima execução do workflow.

**Nunca cole a string com a senha na conversa com o agente.** Se quiser
testar, faça no seu terminal, com um comando que não imprime a senha.

No **PowerShell** (o seu terminal padrão), com o Docker Desktop aberto:

```powershell
$s = Read-Host "cole a URI" -AsSecureString
$env:U = [System.Net.NetworkCredential]::new("", $s).Password
docker run --rm -e U postgres:17-alpine sh -c 'pg_dump --schema-only "$U" | head -5'
Remove-Item Env:U
```

No **Git Bash**, se preferir:

```bash
read -s -p "cole a URI: " U; echo; export U
docker run --rm -e U postgres:17-alpine sh -c 'pg_dump --schema-only "$U" | head -5'
unset U
```

Se aparecerem linhas de SQL, a string está certa. Se aparecer o erro do
socket, ela **não é uma URI válida** — volte ao passo 1.

Sem Docker instalado, **pule este passo**: o passo 7 valida do mesmo jeito, só
custa uma volta a mais se a string estiver errada.

## Passo 4 — Codificar caracteres especiais da senha

Se a senha do banco tiver algum destes caracteres, a URI quebra e o `pg_dump`
volta a cair no socket local. Substituir **só dentro da senha**:

| Caractere | Escrever como |
|---|---|
| `@` | `%40` |
| `:` | `%3A` |
| `/` | `%2F` |
| `#` | `%23` |
| `?` | `%3F` |
| `%` | `%25` |
| `&` | `%26` |
| espaço | `%20` |

Se a senha só tem letras, números e `-` `_` `.` `~`, não precisa mexer.

Atalho para evitar o problema de vez: no reset do passo 2, use uma senha longa
só com letras e números.

## Passo 5 — Regravar o secret no GitHub

1. Abrir <https://github.com/drizaogythub97/gaveta/settings/secrets/actions>
2. Na linha **`SUPABASE_DB_URL`**, clicar no lápis (**Update**).
3. Apagar tudo o que estiver lá e colar a string do passo 2.
4. **Regras de ouro ao colar:**
   - **sem aspas** em volta (nem simples, nem duplas) — foi provavelmente isso
     que quebrou em junho;
   - **sem espaço** antes ou depois;
   - **sem quebra de linha** no fim (o campo é de uma linha só; se o cursor
     pular para a linha de baixo, apague);
   - a string toda em **uma linha só**.
5. **Update secret**.

Não é preciso mexer no `BACKUP_PASSPHRASE` — ele está bom desde 25/06.
Só **não o perca**: sem essa senha o backup criptografado é irrecuperável.
Se você não a tem guardada em lugar seguro, é hora de guardar (gerenciador de
senhas), porque backup que não se abre não é backup.

## Passo 6 — Disparar o backup na mão

1. Abrir <https://github.com/drizaogythub97/gaveta/actions/workflows/backup-db.yml>
2. Botão **Run workflow** → branch `main` → **Run workflow**.
3. Esperar. A execução leva de 1 a 3 minutos.

Pelo terminal, se preferir:

```bash
gh workflow run backup-db.yml
gh run list --workflow=backup-db.yml --limit 1
```

## Passo 7 — Confirmar que ficou verde de verdade

Não basta o ✅. Confira que o backup **tem conteúdo**:

1. Abrir a execução → devem estar verdes os três passos:
   *Gerar dump* → *Criptografar* → *Publicar artifact*.
2. No passo **Gerar dump**, o `ls -lh out` no fim do log mostra o tamanho do
   arquivo. **Alguns megabytes** é o esperado. Se estiver na casa dos poucos
   KB, o dump saiu vazio — algo ainda está errado; me avise.
3. No rodapé da página da execução, seção **Artifacts**, deve existir
   `db-backup-<data>` (retenção de 90 dias).

Pelo terminal:

```bash
gh run list --workflow=backup-db.yml --limit 1
gh run view --log | grep -A3 "ls -lh"
```

## Passo 8 — Provar que o backup abre (faça uma vez, agora)

Backup nunca testado não conta como backup. Uma vez só, para dormir tranquilo:

1. Baixar o artifact: `gh run download <id-da-execução>`
2. Descriptografar (vai pedir a `BACKUP_PASSPHRASE`):

   ```bash
   gpg --decrypt gaveta-<data>.sql.gz.gpg > gaveta.sql.gz
   ```

3. Espiar o começo do SQL:

   ```bash
   gunzip -c gaveta.sql.gz | head -40
   ```

   Tem que aparecer o cabeçalho do `pg_dump` e comandos `CREATE TABLE`.
4. **Apagar os arquivos baixados** — depois de descriptografados eles contêm
   os dados reais dos 4 usuários em texto puro, e não podem ficar largados na
   máquina nem, jamais, entrar no repositório (que é público).

O procedimento completo de restauração está em `docs/06-QUALIDADE-FASE8.md`.

---

## Se ainda falhar, o erro diz qual é o problema

| Mensagem no log | O que significa | O que fazer |
|---|---|---|
| `connection to server on socket "/var/run/postgresql/…" failed` | A string **não é uma URI**. Aspas, espaço ou formato errado. | Refazer os passos 1, 4 e 5 com atenção às aspas. |
| `could not translate host name … to address` | Host errado ou incompleto. | Copiar a URI de novo do painel (passo 1). |
| `network is unreachable` / trava até o timeout | Pegou a **Direct connection** (IPv6). O runner não tem IPv6. | Trocar para **Session pooler** (passo 1.4). |
| `password authentication failed for user "postgres…"` | Senha errada, caractere especial não codificado, ou reset ainda propagando. | Passos 2 e 4; esperar 1 minuto e repetir. |
| `Secret SUPABASE_DB_URL ausente` | O secret ficou vazio. | Regravar (passo 5). |
| `Secret BACKUP_PASSPHRASE ausente` | O outro secret sumiu. | Recriar — e anotar num gerenciador de senhas. |

---

## Depois que voltar a funcionar

- O agendamento é **todo domingo, 03:00 UTC** (meia-noite em Brasília). O
  próximo automático é **domingo, 2026-09-06**. Confira na segunda-feira se
  ficou verde sozinho.
- ⚠️ **O GitHub desliga workflows agendados após 60 dias sem atividade no
  repositório.** Enquanto houver commits, tudo bem. Se o projeto ficar parado
  mais de dois meses, o backup para de rodar em silêncio — e ninguém avisa.
- Vale olhar a aba Actions uma vez por mês, ou me pedir para conferir no começo
  de cada sprint (é um comando só:
  `gh run list --workflow=backup-db.yml --limit 3`).
- Me avise quando estiver verde: eu atualizo o handoff e o roadmap, que hoje
  carregam essa pendência marcada como **crítica e bloqueante**.
