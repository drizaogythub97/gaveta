# FiadoApp × Gaveta — de duas ilhas a um ecossistema

*Como reescrevi meu app de fiado, dei uma experiência mobile de verdade aos dois produtos e fiz o caixa e o caderno de fiado finalmente conversarem — sem obrigar ninguém a nada.*

Documento que acompanha o post de lançamento. Escrito na primeira pessoa, por um desenvolvedor solo que também é o comerciante que usa os dois apps todo dia.

- **FiadoApp** — produção: [fiadoapp.net](https://fiadoapp.net) · marca coral (#E8624A), tema escuro
- **Gaveta** — produção: [gaveta-erp.vercel.app](https://gaveta-erp.vercel.app) · marca verde (#1B7A43)

---

## Sumário

1. [O problema: dois sistemas meus que não se falavam](#1-o-problema)
2. [Os dois produtos, em uma linha cada](#2-os-dois-produtos)
3. [O ponto de partida (antes)](#3-o-ponto-de-partida-antes)
4. [O que fizemos nas sprints](#4-o-que-fizemos-nas-sprints)
5. [A integração-chave: venda a prazo no caixa](#5-a-integração-chave-venda-a-prazo-no-caixa)
6. [O estado atual (depois)](#6-o-estado-atual-depois)
7. [Stack e princípios de engenharia](#7-stack-e-princípios-de-engenharia)
8. [Marca, público e acessibilidade](#8-marca-público-e-acessibilidade)
9. [Perguntas frequentes](#9-perguntas-frequentes)

---

## 1. O problema

Eu tenho uma loja de rações. No caixa, era comum vender a prazo — o famoso fiado. O problema é que eu registrava a venda no caixa e, depois, **redigitava a mesma venda** no meu caderno de fiado digital para saber quem me devia. Mesma pessoa, mesmo comércio, mesmo dono dos dois sistemas — e ainda assim trabalho dobrado, com risco de erro toda vez.

Os dois apps eram **ilhas**. Não havia conta unificada, marca unificada, nem fluxo entre eles. Cada venda a prazo feita no caixa precisava ser digitada de novo no caderno de fiado.

Este documento conta como saí desse ponto.

---

## 2. Os dois produtos

**FiadoApp — o caderno de fiado digital.** Feito para o pequeno comerciante controlar vendas a prazo. Cadastro de clientes, vendas a prazo com itens e vencimento, controle de quem deve, quitações (total, parcial e por venda), alerta de limite de crédito, lista de inadimplentes, cobrança pronta pelo WhatsApp, comprovantes e espelhos de venda (imprimir / compartilhar / PDF / imagem), relatórios (PDF e CSV) e uma tela de analytics.

**Gaveta — o ERP de "caixa e produtos".** Para o mesmo público. Frente de caixa (PDV) com leitor de código de barras, cadastro de produtos, controle de estoque com histórico de movimentações, sessões de caixa e resumo financeiro do dia a dia.

O público dos dois é o mesmo: **comerciantes de bairro, muitos com pouca familiaridade com tecnologia.** Por isso a régua de tudo é simplicidade e clareza.

---

## 3. O ponto de partida (antes)

**FiadoApp** era um app antigo em **PHP/MySQL**. Funcional e em uso real, mas visualmente datado, isolado (não conversava com nenhum outro sistema) e com a experiência mobile herdada do desktop.

**Gaveta** já era um app moderno, porém autônomo, e com o mobile ainda pensado como "desktop encolhido".

E, como já disse, os dois eram ilhas. Mesmo dono, mesmo comerciante, mas nada de conta unificada, marca unificada ou fluxo entre eles.

---

## 4. O que fizemos nas sprints

Foram sprints de polimento visual **e** de integração. Quatro frentes.

### 4.1 Reescrita completa do FiadoApp (v1 → v2)

Reescrevi o FiadoApp inteiro na stack moderna, mantendo **paridade funcional** — nada que funcionava antes deixou de funcionar. O ponto mais delicado foi migrar os dados de produção **sem perda**:

| Dado | Registros migrados |
|---|---|
| Clientes | 61 |
| Vendas | 248 |
| Itens de venda | 372 |
| Pagamentos | 192 |

**Zero divergência** entre o antigo e o novo. E o app virou um **PWA instalável** — dá para colocar na tela inicial do celular como se fosse um aplicativo nativo.

### 4.2 Nova experiência mobile nos dois apps

Criei um **modo "Minimalista"** opcional e denso para celular, em vez de espremer a tela de desktop. Ele traz barra de navegação inferior, escala tipográfica própria, listas tocáveis, controles segmentados e comprovantes com compartilhamento nativo. **Cada aparelho escolhe** entre o modo Simples e o Minimalista — a preferência é por dispositivo.

### 4.3 Ecossistema opt-in entre os dois apps

O princípio que guiou tudo: **uma conta, dois apps completos, pontes opcionais.**

A infraestrutura é compartilhada — o mesmo backend por trás dos dois — e é isso que permite **SSO nativo: um login vale nos dois**. Mas **toda integração é opcional, tem liga/desliga individual e nasce desligada.** Ninguém é empurrado para nada.

O que entregamos nessa frente:

- **Descoberta** — uma página "Ecossistema" em cada app e um convite que dá para dispensar. Quem não tem interesse, ignora e segue a vida.
- **Atalho entre apps** — um botão para abrir o outro app com a mesma conta, agora exibindo a **logo do outro app** no próprio botão.
- **Marca única** — o nome e a logo da sua loja passam a valer nos dois apps ao mesmo tempo. E há **política de retorno**: se você desligar, cada app restaura a marca que tinha antes.
- **"Venda a prazo no caixa"** — a integração-chave, detalhada na próxima seção.

### 4.4 Polimento fino

Alinhamento simétrico de botões, exibição de itens mais limpa, **badges de integração** (cada app referencia o outro com a cor e a logo dele) e consistência visual entre as duas telas.

---

## 5. A integração-chave: venda a prazo no caixa

Essa é a ponte que resolve exatamente a dor que me fez começar tudo.

**Como funciona.** No PDV do Gaveta há um bloco **"Venda a Prazo (Fiado)"**: você escolhe o cliente (ou usa **"Cadastrar Novo Cliente"** ali mesmo) e toca em **"Registrar a prazo"**. A partir daí:

1. A venda **entra automaticamente como "a receber" no FiadoApp**, sem redigitar nada — e vem marcada com a badge **"Registrada no Gaveta"**, para você saber de onde ela veio.
2. O **estoque baixa** no Gaveta, como em qualquer venda.
3. Quando o cliente paga (a quitação acontece no FiadoApp), o valor entra no **faturamento do Gaveta na data do pagamento**.

**Por que o faturamento entra só no pagamento.** É uma regra contábil, não um detalhe técnico: venda a prazo é *a receber*, nunca faturamento no ato. O modelo é **base caixa** — a receita é reconhecida quando o dinheiro entra. Isso evita **contagem dobrada** (contar a venda uma vez quando ela é feita e de novo quando é paga).

**Uma transação, não duas gravações soltas.** Por baixo, o registro passa por uma **função-ponte no banco** (`registrar_venda_fiado`) que, numa **única transação**, cria o "a receber" no FiadoApp e a venda no Gaveta com a baixa de estoque. Ou as duas coisas acontecem, ou nenhuma — não existe o estado "entrou no fiado mas não deu baixa no caixa". Vale lembrar que o caixa apenas **consulta** os clientes do caderno (mesma conta via SSO, isolados por RLS); o caderno de fiado segue nativo do FiadoApp.

**Consistência entre os dois lados.** Excluir a venda em qualquer um dos apps a remove do outro **e estorna o estoque**. Nada fica órfão.

**Saída limpa.** Desligar a ponte pede senha e deixa você escolher **manter ou apagar** as vendas que já passaram por ela. Você não fica preso.

---

## 6. O estado atual (depois)

Dois aplicativos modernos, acessíveis e instaláveis, que **funcionam 100% sozinhos** — mas que, quando o comerciante quer, se comportam como **um ecossistema**: um login, uma marca, e o fluxo "**vendeu fiado no caixa → cobrou no FiadoApp → entrou no financeiro do Gaveta**" acontecendo sozinho.

Tudo feito por um desenvolvedor solo que também é o usuário final.

---

## 7. Stack e princípios de engenharia

**Stack.** Next.js (App Router) + TypeScript + React; Tailwind CSS + shadcn/ui; Supabase (PostgreSQL + Auth + Row Level Security); deploy na Vercel; validação com Zod; testes com Vitest e Playwright.

**Segurança levada a sério.** RLS sempre ativo, isolando os dados por usuário; CSP com nonce; rate limiting; segredos fora do cliente.

**O que viabiliza o SSO.** O backend é **compartilhado** entre os dois apps — por isso um login vale nos dois. As tabelas de cada app ficam **isoladas por prefixo e por RLS**, então compartilhar a infraestrutura não significa misturar os dados dos dois produtos.

**Acessibilidade AA.** Contraste adequado, alvos de toque de pelo menos 44px, fontes grandes e textos em português simples — porque boa parte do público tem pouca familiaridade com tecnologia.

---

## 8. Marca, público e acessibilidade

- **FiadoApp:** coral **#E8624A**, tema escuro.
- **Gaveta:** verde **#1B7A43** (variante **#2FA05F** no tema escuro).
- **Público:** comerciantes de bairro, muitos com pouca familiaridade com tecnologia. A régua de todo o produto é simplicidade e clareza.
- Cada app referencia o outro com a **cor e a logo dele** — sinal visual de que são dois produtos distintos que se conectam, não um só. Na prática, isso virou um par de badges simétricas: no FiadoApp, a venda vinda do caixa mostra **"Registrada no Gaveta"** (verde + logo do Gaveta); no Gaveta, a referência ao caderno aparece como **"Integração FiadoApp"** (coral + logo do FiadoApp). Cada uma usa a cor e a logo do *outro* app.

---

## 9. Perguntas frequentes

**Preciso usar os dois apps?**
Não. Cada um funciona 100% sozinho. A integração é opcional e nasce desligada.

**Se eu ligar a integração, dá para voltar atrás?**
Dá. Desligar a ponte pede senha e deixa você escolher manter ou apagar as vendas que passaram por ela. A marca única também tem política de retorno: desligou, cada app volta à marca anterior.

**Meus dados antigos do FiadoApp foram preservados na reescrita?**
Sim — a migração foi feita sem perda, com zero divergência.

**Por que a venda fiada não aparece no faturamento na hora?**
Porque venda a prazo é "a receber", não faturamento. O valor entra no faturamento do Gaveta na data em que o cliente paga (base caixa), evitando contar a mesma venda duas vezes.

**O limite de crédito bloqueia a venda?**
Não. O limite **nunca** bloqueia — ele só avisa no momento da venda e deixa um aviso no cliente enquanto ele estiver acima do limite. A decisão de vender continua sendo sua.

**As vendas já pagas continuam registradas?**
Sim. O v2 guarda o **histórico completo** de vendas pagas, por cliente — nada some, fica tudo consultável.

---

## Experimente

- **FiadoApp** — o caderno de fiado digital: [fiadoapp.net](https://fiadoapp.net)
- **Gaveta** — o caixa, os produtos e o estoque: [gaveta-erp.vercel.app](https://gaveta-erp.vercel.app)

Cada um funciona sozinho. Juntos, viram um ecossistema — no seu tempo, se você quiser.
