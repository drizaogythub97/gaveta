<div align="center">

<img src="assets/brand/wordmark-horizontal.png" alt="Gaveta" width="360" />

**ERP web leve, acessível e seguro para o pequeno comércio.**
Cadastro de produtos, frente de caixa e demonstrativos de faturamento — pensado para quem tem pouca intimidade com tecnologia.

[![Demo](https://img.shields.io/badge/Demo-gaveta--erp.vercel.app-1b7a43)](https://gaveta-erp.vercel.app)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-149eca)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20Auth%20%2B%20RLS-3FCF8E)](https://supabase.com/)
[![Security Headers](https://img.shields.io/badge/Security%20Headers-A-1b7a43)](https://securityheaders.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

</div>

---

<div align="center">
  <img src="docs/screenshots/demo.gif" alt="Demonstração da frente de caixa do Gaveta" width="820" />

  <br/><em>Fluxo de venda (acelerado)</em> · ▶ <a href="assets/demo/Demonstrativo%20Gaveta%20Completo.mp4">ver demonstração completa (60s)</a>
</div>

## Sobre o projeto

O **Gaveta** é um ERP web multiusuário construído como peça de portfólio com padrões de mercado. Cada usuário cadastra seus produtos, registra vendas numa **frente de caixa** rápida e acompanha o faturamento por painéis. O público inicial são **pessoas idosas e lojistas com pouca familiaridade com tecnologia** — por isso a interface prioriza **clareza, botões grandes, alto contraste e poucos passos**.

Dois pilares guiaram todo o desenvolvimento: **simplicidade de uso** e **segurança dos dados** (tratada como requisito de primeira classe, não como um "extra no final"). O sistema está **em produção**, com custo de infraestrutura de **R$ 0** (todos os serviços em plano gratuito).

## Funcionalidades

- **Frente de caixa** rápida: busca por nome com autocompletar, item avulso por digitação, **leitura de código de barras por scanner USB e pela câmera** (no celular), **desconto** no total e cálculo automático.
- **Formas de pagamento** com **taxas por método** (dinheiro, Pix, débito, crédito à vista, crédito parcelado, vale) e **parcelamento**; registro transacional que **baixa o estoque** automaticamente.
- **Comprovante de venda** (não fiscal): impressão em **bobina 80/58 mm e A4** com pré-visualização, cabeçalho com nome/logo e rodapé personalizáveis; **compartilhamento por texto** (WhatsApp, e-mail).
- **Estorno de venda que devolve o estoque** e **histórico imutável de movimentação de estoque** (venda, estorno, reposição, ajuste).
- **Fechamento de caixa**: abertura com troco, **sangria/suprimento** e conferência (esperado × contado).
- **Financeiro** em três abas: **Vendas**, **Despesas** (por categoria) e **Resumo** (receita bruta, taxas, receita líquida, despesas, **resultado** e **projeção do mês**), com filtros por período e forma de pagamento.
- **Dashboards**: inicial (indicadores), estoque (filtros dinâmicos) e financeiro.
- **Produtos**: CRUD com código de barras opcional (1:N) e opção de **controlar estoque ou não** (ex.: marmitas).
- **Preferências**: tema claro/escuro, **identidade da loja** (nome + logo com upload e recorte), taxas por método e opções de impressão.
- **PWA instalável** (tela cheia no celular), **acessibilidade** (AA), **multiusuário com isolamento total via RLS** e **LGPD** (aceite no cadastro + exclusão de conta/dados).

## Telas

| Frente de caixa | Financeiro | Painel inicial |
| :-------------: | :--------: | :------------: |
| ![Frente de caixa](docs/screenshots/caixa.png) | ![Financeiro](docs/screenshots/financeiro.png) | ![Painel inicial](docs/screenshots/dashboard.png) |
| **Produtos** | **Estoque** | **Login** |
| ![Produtos](docs/screenshots/produtos.png) | ![Estoque](docs/scre