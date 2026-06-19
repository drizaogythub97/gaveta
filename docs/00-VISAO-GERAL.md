# 00 — Visão Geral do Produto

## Problema

Pequenos comerciantes precisam de uma ferramenta simples para registrar produtos, lançar vendas e entender quanto faturaram. As soluções de mercado costumam ser caras, cheias de funções ou complexas demais — especialmente para pessoas com pouca familiaridade com tecnologia.

## Proposta

Um ERP web minimalista, gratuito e **extremamente fácil de usar**, com três pilares funcionais: cadastro de produtos, frente de caixa e relatórios de faturamento. O público inicial são **pessoas idosas**, o que torna a clareza visual e a simplicidade de fluxo requisitos de primeira classe — não detalhes estéticos.

## Princípios de produto

1. **Simplicidade acima de tudo.** Toda função importante deve ser alcançada em até 3 toques (regra dos três cliques).
2. **Errar deve ser difícil e reversível.** Confirmações claras, ações desfazíveis, mensagens em linguagem simples (sem jargão técnico).
3. **Acessibilidade não é opcional.** Contraste AA, fontes grandes, alvos de toque generosos, feedback imediato de cada ação.
4. **Segurança e privacidade por padrão.** Isolamento total de dados por usuário; coleta mínima de dados pessoais; conformidade com a LGPD.
5. **Funciona no celular e no computador.** Mesma experiência, layout adaptado.

## Personas

- **Dona Marta, 68 anos** — dona de uma loja de bairro. Usa o celular para WhatsApp e pouco mais. Precisa registrar uma venda rapidamente enquanto atende o cliente.
- **Seu Antônio, 71 anos** — quer saber no fim do dia/mês quanto vendeu, sem planilhas complicadas.

## Escopo do MVP (primeira versão testável)

Incluído:

- Cadastro de novo usuário com aceite da política de privacidade.
- Login com e-mail e senha (com recuperação de senha).
- Cadastro/edição/remoção de produtos (nome, preço, data de inclusão, **código de barras opcional**, e opção de **controlar ou não o estoque** — ex.: marmitas não têm quantidade definida).
- Frente de caixa: adicionar itens por **leitura de código de barras** (scanner USB), por busca de nome (produto cadastrado, preenchimento automático) ou por digitação manual (produto avulso), com cálculo de subtotal/total e registro da venda.
- Baixa automática de estoque ao registrar venda de produto cadastrado **que controle estoque** (produtos sem controle são vendidos sem afetar quantidade).
- Dashboard inicial com indicadores básicos (faturamento do dia/mês, nº de vendas, produtos com estoque baixo).
- Dashboard de estoque com filtros dinâmicos (nome, data de inclusão, quantidade) e listagem reativa.
- Dashboard financeiro com listagem de vendas, filtros e faturamento por período (sugerido e personalizado).

Fora do MVP (evoluções futuras):

- Múltiplos funcionários por conta / papéis (admin, operador).
- Leitura de código de barras **por câmera** (no MVP, leitura por scanner USB/teclado já é suportada).
- Emissão de nota fiscal.
- Relatórios exportáveis em PDF/Excel.
- Categorias de produto, fornecedores, controle de custo/margem.

## Métricas de sucesso (para o portfólio)

- Um usuário novo consegue cadastrar um produto e registrar a primeira venda em **menos de 2 minutos**, sem ajuda.
- 100% das telas com pontuação de acessibilidade ≥ 95 no Lighthouse.
- Tempo de carregamento interativo < 2,5s em conexão 4G simulada.
- Zero vazamento de dados entre usuários (validado por testes automatizados de RLS).
