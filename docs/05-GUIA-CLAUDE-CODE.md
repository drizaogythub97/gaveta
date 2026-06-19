# 05 — Guia de Execução no Claude Code

Este guia mostra, passo a passo, como sair do planejamento e chegar a um sistema funcional usando o **Claude Code**. Os prompts abaixo são pensados para serem colados na ordem. O Claude Code lê automaticamente o `CLAUDE.md` e a pasta `docs/`.

## Antes de começar
1. Conclua a **Fase 0** do roadmap (contas Supabase e Vercel, chaves copiadas).
2. Crie o `.env.local` a partir de `.env.example` e preencha as 3 chaves.
3. Abra um terminal **nesta pasta** (`ERP Simples`) e rode o Claude Code.

> Dica: trabalhe **uma fase por vez**. Ao terminar cada fase, revise o resultado, rode o app e faça um commit antes de seguir.

---

## Prompt 0 — Orientação inicial
```
Leia CLAUDE.md e todos os arquivos em docs/. Em seguida, me dê um resumo
de 5 linhas confirmando que entendeu o escopo, a stack e as regras de
segurança. Não escreva código ainda.
```

## Prompt 0.5 — Conectar a pasta ao GitHub (Git)
> Você já criou o repositório vazio na Fase 0. NÃO clone (isso traria uma pasta
> vazia). Em vez disso, transforme esta pasta no repositório, conectando-a ao
> remoto. Troque a URL pela do seu repositório.
```
Esta pasta já tem conteúdo e ainda não é um repositório Git. Inicialize o Git
aqui (git init), faça o primeiro commit com os arquivos de planejamento atuais
e conecte ao meu repositório remoto:
https://github.com/SEU-USUARIO/erp-simples.git
Confirme que o .env.local está sendo ignorado pelo .gitignore (não pode ir para
o GitHub) e faça o push para a branch main.
```

## Prompt 1 — Fase 1: Fundação
```
Execute a FASE 1 do docs/01-ROADMAP-FASES.md. Inicialize um projeto
Next.js (App Router) + TypeScript + Tailwind + ESLint/Prettier nesta pasta,
configure shadcn/ui com os tokens de docs/02-DESIGN-SYSTEM-IDOSOS.md,
configure Vitest e Playwright, e crie os clients Supabase (server, client,
middleware) usando @supabase/ssr lendo as variáveis do .env.local.
Ao final, garanta que `npm run dev` sobe sem erros e valide a conexão com o
Supabase. Faça commits pequenos e descritivos.
```

## Prompt 2 — Fase 2: Banco e RLS
```
Execute a FASE 2. Aplique o SQL de supabase/migrations/0001_init.sql no meu
projeto Supabase (me oriente se eu precisar colar algo no SQL Editor).
Depois escreva testes automatizados que comprovem o isolamento por RLS:
crie dois usuários de teste e verifique que um NÃO acessa dados do outro.
```

## Prompt 3 — Fase 3: Autenticação e cadastro
```
Execute a FASE 3. Implemente as telas de login (index), cadastro com aceite
OBRIGATÓRIO da política de privacidade (docs/04-POLITICA-PRIVACIDADE.md) e
recuperação de senha. Use email + senha (Supabase Auth). Proteja as rotas
com supabase.auth.getUser() no middleware. Mensagens de erro em português
simples. Siga o design system (botões grandes, contraste, rótulos acima dos
campos).
```

## Prompt 4 — Fase 4: Produtos e Frente de Caixa (MVP testável)
```
Execute a FASE 4. Implemente o CRUD de produtos e a Frente de Caixa exatamente
como descrito em docs/02-DESIGN-SYSTEM-IDOSOS.md (seção "Frente de Caixa").
No cadastro de produto inclua: código de barras OPCIONAL (campo barcode) e a
opção "Controlar estoque? Sim/Não" (track_stock) — quando Não, esconda o campo
de quantidade (ex.: marmitas). Na Frente de Caixa, o campo de adição deve ter
foco automático e aceitar LEITURA POR CÓDIGO DE BARRAS via scanner USB
(keyboard wedge: o leitor digita o código e envia Enter; busque o produto pelo
barcode e adicione automaticamente). Mantenha também autocompletar por nome,
item avulso por digitação, botões + / - para quantidade, total em destaque, e
registro via a função RPC register_sale (transação atômica; baixa de estoque
SOMENTE para produtos com track_stock = true). Ao final, devo conseguir
cadastrar um produto, bipar/buscar e registrar uma venda localmente.
```

## Prompt 5 — Fase 5: Dashboards
```
Execute a FASE 5. Crie os três dashboards:
1) Inicial: atalhos para as seções + indicadores (faturamento dia/mês, nº de
   vendas, produtos com estoque baixo).
2) Estoque: filtros dinâmicos (nome, data de inclusão, quantidade) com listagem
   que reage aos filtros em tempo real.
3) Financeiro: lista de vendas com filtros e faturamento por período (hoje, 7d,
   30d, mês atual e intervalo personalizado). Permitir estorno de venda (status
   voided), de forma reversível.
Mantenha tudo responsivo (cartões no mobile, tabela no desktop).
```

## Prompt 6 — Fase 6: Deploy
```
Execute a FASE 6. Prepare o projeto para deploy na Vercel e me guie para:
importar o repositório na Vercel, colar as variáveis de ambiente, e ajustar as
Redirect URLs no Supabase para o domínio gerado. Valide o build de produção.
Confirme que nada quebra a portabilidade para Cloudflare Pages.
```

## Prompt 7 — Fase 7: Segurança aprofundada
```
Execute a FASE 7 conforme docs/03-SEGURANCA-E-DADOS.md (S1–S7): validação Zod
no servidor, rate limiting em login/cadastro/recuperação, headers de segurança
(CSP, HSTS, etc.), cookies seguros, tratamento de erros sem vazamento. Depois
rode /security-review sobre as mudanças e corrija os achados. Mostre um resumo
do que foi endurecido.
```

## Prompt 8 — Fase 8: Qualidade e acessibilidade
```
Execute a FASE 8. Rode auditoria de acessibilidade/performance (meta Lighthouse
>= 95 em acessibilidade), escreva testes E2E (Playwright) dos fluxos: cadastro,
login, criar produto, registrar venda, ver dashboards. Ajuste responsividade,
estados de carregamento e vazio. Documente o procedimento de backup/export do
banco.
```

## Prompt 9 — Fase 9: Portfólio
```
Execute a FASE 9. Atualize o README com instruções finais e espaços para
screenshots/GIF, gere um texto pronto para post no LinkedIn descrevendo o
projeto, as decisões técnicas (RLS, acessibilidade para idosos, stack gratuita)
e os aprendizados. Crie a tag v1.0.0.
```

---

## Dicas de uso do Claude Code
- Use `/security-review` antes de publicar e após mudanças sensíveis.
- Faça commits frequentes; é mais fácil reverter um passo do que um dia inteiro.
- Se algo fugir do escopo, peça ao Claude Code para registrar como "evolução futura" em vez de implementar.
- Teste no celular real (ou DevTools modo dispositivo) cedo — o público-alvo usa muito o celular.
