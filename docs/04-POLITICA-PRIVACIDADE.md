# Política de Privacidade — ERP Simples

_Última atualização: a definir na publicação._

Esta Política explica, de forma simples, como o **ERP Simples** trata seus dados. Ao criar uma conta, você declara que leu e concorda com este documento (exigência da Lei nº 13.709/2018 — LGPD).

## 1. Quem somos
O ERP Simples é um sistema de gestão pessoal de produtos e vendas, mantido por Adriano Cardoso como projeto de portfólio. Contato: adriano.cardoso97@gmail.com.

## 2. Quais dados coletamos
Coletamos o mínimo necessário para o funcionamento:

- **E-mail**: para criar e acessar sua conta.
- **Nome** (opcional): para personalizar a saudação.
- **Dados que você cadastra no uso**: seus produtos, vendas e valores. Esses dados são seus e ficam isolados da conta de qualquer outro usuário.
- **Data do aceite** desta política.

Não coletamos dados sensíveis (saúde, biometria, origem racial, etc.) nem dados de pagamento.

## 3. Para que usamos
- Autenticar seu acesso e manter sua conta.
- Armazenar e exibir os produtos e vendas que você registra.
- Gerar seus relatórios de faturamento.

Não vendemos nem compartilhamos seus dados com terceiros para marketing.

## 4. Onde os dados ficam
Os dados são armazenados em servidores do **Supabase** (infraestrutura em nuvem), com criptografia em trânsito (HTTPS) e em repouso. O acesso é protegido por isolamento no nível do banco de dados (Row Level Security): **cada usuário só acessa os próprios dados**.

## 5. Seus direitos (LGPD)
Você pode, a qualquer momento:

- **Acessar** e **corrigir** seus dados pela própria interface.
- **Excluir sua conta** e todos os dados associados (função "Excluir minha conta"), de forma permanente.
- Solicitar informações sobre o tratamento pelo e-mail de contato.

## 6. Retenção
Mantemos seus dados enquanto sua conta existir. Ao excluir a conta, os dados são apagados de forma permanente e em cascata.

## 7. Cookies
Usamos apenas cookies essenciais para manter sua sessão de login (autenticação). Não usamos cookies de publicidade ou rastreamento.

## 8. Alterações
Esta política pode ser atualizada. Mudanças relevantes serão comunicadas na aplicação.

---

> **Nota de implementação:** este texto é a base do MVP. Para uso comercial real, recomenda-se revisão jurídica. No cadastro, o aceite é registrado em `profiles.privacy_accepted_at` e o checkbox de aceite é **obrigatório** para concluir o registro.
