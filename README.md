# Gaveta

> **Gaveta** — sistema de gestão (ERP) leve e acessível para registro de **produtos**, **vendas** e **demonstrativos de faturamento**, com foco em usabilidade para pessoas com pouca familiaridade com tecnologia.

[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20Auth-3FCF8E)](https://supabase.com/)
[![Vercel](https://img.shields.io/badge/Deploy-Vercel-black)](https://vercel.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## Sobre o projeto

ERP web simples e multiusuário, construído como peça de portfólio com padrões de mercado. Permite que cada usuário cadastre seus produtos, registre vendas em uma frente de caixa intuitiva e acompanhe faturamento por painéis (dashboards). O design prioriza **clareza, botões grandes, alto contraste e poucos passos** — pensado para um público inicial de pessoas idosas.

### Principais características

- **Frente de caixa** rápida: busca por nome com autocompletar, ou digitação manual de produtos avulsos, com cálculo automático de totais.
- **Dashboards**: inicial (visão geral), estoque (com filtros dinâmicos) e financeiro (vendas e faturamento por período).
- **Multiusuário com isolamento total de dados** via Row Level Security (RLS) do PostgreSQL — cada usuário só acessa os próprios dados, garantido no nível do banco.
- **Responsivo de verdade**: otimizado para desktop e celular.
- **Acessível**: contraste AA, fontes grandes, alvos de toque ≥ 44px, feedback visual claro.
- **LGPD**: política de privacidade com aceite no cadastro e direito de exclusão de conta/dados.

## Stack

| Camada              | Tecnologia                                | Por quê                                                           |
| ------------------- | ----------------------------------------- | ----------------------------------------------------------------- |
| Front-end           | Next.js (App Router) + React + TypeScript | Padrão de mercado, ótimo para portfólio, renderização no servidor |
| Estilo / UI         | Tailwind CSS + shadcn/ui                  | Componentes acessíveis prontos, design responsivo rápido          |
| Back-end / DB       | Supabase (PostgreSQL)                     | Banco relacional gerenciado, ideal para vendas e relatórios       |
| Autenticação        | Supabase Auth (email + senha)             | Login robusto pronto, com recuperação de senha                    |
| Isolamento de dados | PostgreSQL Row Level Security             | Isolamento por usuário no nível do banco (defense-in-depth)       |
| Hospedagem          | Vercel (preparado para Cloudflare Pages)  | Deploy automático via GitHub; migração futura facilitada          |
| Testes              | Vitest + Playwright                       | Unidade/integração e ponta-a-ponta                                |

Custo total: **R$ 0** (todos os serviços em plano gratuito).

## Documentação

Todo o planejamento está em [`/docs`](./docs):

1. [Visão geral do produto](./docs/00-VISAO-GERAL.md)
2. [Roadmap por fases (inclui Fase 0 — suas ações)](./docs/01-ROADMAP-FASES.md)
3. [Design system para idosos](./docs/02-DESIGN-SYSTEM-IDOSOS.md)
4. [Segurança e modelo de dados](./docs/03-SEGURANCA-E-DADOS.md)
5. [Política de privacidade (LGPD)](./docs/04-POLITICA-PRIVACIDADE.md)
6. [Segurança & hardening — controles, evidências e verificação](./docs/05-SEGURANCA-HARDENING.md)

## Começando

> **Importante:** antes de programar, conclua a **Fase 0** do [roadmap](./docs/01-ROADMAP-FASES.md) (criar contas Supabase e Vercel e configurar variáveis de ambiente).

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variáveis (copie e preencha)
cp .env.example .env.local

# 3. Rodar em desenvolvimento
npm run dev
```

## Licença

MIT © Adriano Cardoso
