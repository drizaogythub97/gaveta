# Qualidade, Acessibilidade & Performance — Fase 8

> **Documento vivo.** Registra a evidência da Fase 8 do roadmap
> (`docs/01-ROADMAP-FASES.md`): testes E2E dos fluxos críticos, auditoria
> Lighthouse (meta ≥ 95 em Acessibilidade/Performance) e a estratégia de
> backup do banco. Acompanha `05-SEGURANCA-HARDENING.md` como prova de
> verificação do projeto.

Última atualização: **2026-06-25**.

---

## Público-alvo (contexto que orienta as metas)

O Gaveta atende **qualquer pessoa com pouca destreza no manuseio de sistemas
tecnológicos** — idosos são o caso mais óbvio, mas não o único. Por isso
acessibilidade e estabilidade visual não são "pontos extra": são requisito.
Métricas como **CLS = 0** (sem saltos de layout) e **Acessibilidade = 100**
importam diretamente para esse usuário.

---

## 1. Testes E2E (Playwright)

Suíte em `tests/e2e/`, executada com `npm run test:e2e` (Chromium). Cobre os
fluxos públicos de ponta a ponta, sem depender de usuário real no banco.

| Arquivo | O que cobre |
| --- | --- |
| `home.spec.ts` | Raiz redireciona para `/login` com a marca Gaveta visível. |
| `auth-navigation.spec.ts` | Navegação login ↔ signup ↔ recuperação e abertura da Política de Privacidade. |
| `auth-validation.spec.ts` | Validação Zod de login e signup (e-mail inválido, senha vazia, política não aceita, senha fraca). |
| `protected-routes.spec.ts` | Middleware redireciona `/dashboard`, `/caixa`, `/estoque`, `/financeiro`, `/produtos`, `/minha-conta` para `/login?next=…` quando não autenticado. |

**Decisão de projeto:** a validação (Zod) roda no servidor **antes** do rate
limit e de qualquer chamada ao Supabase. Logo, os testes de validação
exercitam o caminho de erro com entradas inválidas **sem criar usuários reais
nem consumir o limite de tentativas** — testes determinísticos e sem efeitos
colaterais. Os specs usam seletores acessíveis (`getByLabel`/`getByRole`), o
que de quebra valida que labels e papéis ARIA das telas estão corretos.

**Resultado:** `npm run test:e2e` → **13 testes, todos passando**.

---

## 2. Auditoria Lighthouse

Auditoria executada contra a **produção** (`https://gaveta-erp.vercel.app`),
Chrome headless, nas páginas públicas. Meta do roadmap: **≥ 95** em
Acessibilidade e Performance.

| Página | Performance | Acessibilidade | Best Practices | SEO |
| --- | :---: | :---: | :---: | :---: |
| `/login` | 98 | **100** | 100 | 100 |
| `/signup` | 97 | **100** | 100 | 100 |
| `/privacidade` | 99 | **100** | 100 | 100 |

**Core Web Vitals** (todas dentro da faixa "bom"):

| Página | FCP | LCP | TBT | CLS | Speed Index |
| --- | --- | --- | --- | --- | --- |
| `/login` | 0,9 s | 2,3 s | 30 ms | **0** | 3,1 s |
| `/signup` | 0,9 s | 2,4 s | 70 ms | **0** | 1,1 s |
| `/privacidade` | 0,9 s | 2,1 s | 20 ms | **0** | 1,0 s |

**Achados / oportunidades:**

- **Nenhuma correção de acessibilidade necessária** — pontuação 100 em todas as
  páginas auditadas.
- Única oportunidade de performance: ~21 KiB de JavaScript não utilizado em
  `/privacidade`. Impacto desprezível (perf já 99) e o risco de mexer no
  bundle não compensa neste momento — registrado, não acionado.

> As páginas autenticadas (dashboard, caixa, estoque, financeiro) não foram
> auditadas automaticamente por exigirem sessão; partilham os mesmos
> componentes de UI e tokens de design das páginas públicas (alvos ≥ 44px,
> contraste AA, fontes grandes — ver `02-DESIGN-SYSTEM-IDOSOS.md`).

---

## 3. Backup do banco

O plano grátis do Supabase **não** oferece backup automático (PITR/snapshots são
pagos). Para compensar, o projeto faz **backup automático, criptografado e
off-site**, sem exigir ação manual recorrente.

### Como funciona

- **Workflow:** `.github/workflows/backup-db.yml`, agendado por cron (domingos
  03:00 UTC) + disparo manual (`workflow_dispatch`).
- **Dump:** `pg_dump` rodando na imagem `postgres:17-alpine` (um cliente novo
  dumpa servidores mais antigos sem problema), comprimido com `gzip -9`.
- **Criptografia:** o dump é cifrado com **GPG simétrico (AES-256)** *antes* de
  sair do runner, usando uma senha guardada em *secret*. Por isso é seguro
  guardá-lo como **artifact** mesmo o repositório sendo **público** — o conteúdo
  em claro nunca é publicado.
- **Armazenamento:** artifact do GitHub Actions, retenção de **90 dias**
  (rotação automática). Fica **fora do Supabase**, então protege contra erro de
  migração, deleção acidental ou perda da base.
- **Segurança operacional:** a connection string fica apenas no *env* do
  container (nunca no `argv`/logs); os passos não imprimem segredos.

> Também há `scripts/backup-db.sh` para gerar um backup criptografado **local**
> sob demanda (mesma lógica), útil antes de uma migração arriscada.

### Configuração (uma única vez)

Cadastrar dois *secrets* no repositório (`Settings → Secrets and variables →
Actions`, ou via `gh secret set`):

| Secret | O que é | Onde obter |
| --- | --- | --- |
| `SUPABASE_DB_URL` | Connection string do **Session pooler** (IPv4, porta 5432) | Supabase → *Project Settings → Database → Connection string → Session pooler* (inclua a senha do banco) |
| `BACKUP_PASSPHRASE` | Senha forte para cifrar/decifrar os dumps | Você define. **Guarde fora do repo** — sem ela o backup é irrecuperável. |

> Usa-se o **Session pooler** (não a conexão direta) porque os runners do GitHub
> são IPv4 e a conexão direta do Supabase é IPv6.

O cron só dispara a partir da branch padrão (`main`), então o backup passa a
rodar sozinho **após o merge**. Para validar na hora: *Actions → Backup do banco
→ Run workflow* (ou `gh workflow run backup-db.yml`).

### Restauração

1. Baixar o artifact desejado (*Actions → run → Artifacts*) — um `.sql.gz.gpg`.
2. Decifrar e descomprimir:
   ```bash
   gpg --batch --pinentry-mode loopback --passphrase "$BACKUP_PASSPHRASE" \
     --decrypt gaveta-XXXX.sql.gz.gpg | gunzip > restore.sql
   ```
3. Restaurar em um banco (de preferência um projeto/instância limpa):
   ```bash
   psql "$DB_URL" -f restore.sql
   ```

> O dump inclui o schema `public` (dados do app) com `--no-owner
> --no-privileges`, facilitando restaurar em outra instância. Schemas geridos
> pelo Supabase (`auth`, `storage`) são recriados pela própria plataforma.
