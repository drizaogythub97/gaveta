# Estudo: receber por Pix dentro do Gaveta (24/09/2026)

**Pergunta do dono:** receber por Pix com QR Code e Copia e Cola direto do
app, caindo na conta **Nubank**, pagando **zero de taxa**. E: o Nubank
disponibiliza API gratuita para integrar com software de terceiros?

**Resposta curta:** o Nubank **não tem API** para isso — nem gratuita nem
paga. Mas o que você pediu **dá para fazer sem API nenhuma**, com custo zero
e o dinheiro caindo direto no Nubank. O que não dá é a **confirmação
automática** do pagamento, e é só isso que a API resolveria.

---

## Parte 1 — O Nubank tem API de Pix?

**Não.** Três fontes independentes, e nenhuma contradiz as outras:

| Fonte | O que diz |
| --- | --- |
| [Lista comunitária de PSPs com API Pix (repositório do BACEN)](https://github.com/bacen/pix-api/discussions/187) | Nubank aparece marcado com "**?**" — não consta como oferecendo. Os confirmados são GerenciaNet (Efí), BS2 e, depois, Itaú. |
| [Página oficial do Pix Nu Empresas](https://nubank.com.br/empresas/conta/pix) | Fala de QR Code, cobrança e tarifas. **Nenhuma menção a API, webhook ou integração.** |
| [Central de ajuda da Woovi](https://ajuda.woovi.com/hc/duvidas-frequentes/articles/consigo-receber-pix-com-api-no-nubank) | Responde exatamente esta pergunta — e a resposta é usar o Nubank **como conta de destino** de outra plataforma, não como API. |

O fórum oficial do Nubank tem pedidos de API de PJ abertos há anos
([2023](https://comunidade.nubank.com.br/t/api-pix/323217),
[2024](https://comunidade.nubank.com.br/t/criação-de-uma-api-para-o-pix/292073),
[2025](https://comunidade.nubank.com.br/t/api-oficial-do-nubank-para-desenvolvedores/640431))
sem resposta afirmativa.

### E os projetos "nubank-api-pix" do GitHub?

Existem, funcionam de um jeito e **não servem para o Gaveta**. Eles não falam
com API nenhuma do banco: **leem o e-mail de notificação** que o Nubank manda
a cada Pix recebido, ou reaproveitam o login do aplicativo.

Não recomendo, por três motivos concretos:

1. **Exigem a credencial do seu banco ou do seu e-mail dentro do Gaveta.**
   Isso contraria frontalmente a sua própria regra de que nenhuma melhoria
   pode piorar a segurança do sistema. Hoje o Gaveta não guarda segredo
   nenhum que dê acesso a dinheiro; isso mudaria.
2. **Quebram sem aviso.** Dependem do formato de um e-mail ou de uma API
   interna, que mudam quando o Nubank quiser.
3. **Não são canal oficial**, então nenhum problema de conciliação teria a
   quem recorrer.

### E o Open Finance?

O Nubank participa, mas não resolve: a iniciação de pagamento serve para
**pagar**, não para receber, e ler a movimentação da conta exige ser
instituição autorizada pelo Banco Central (AISP/ITP). Fora de alcance, e por
um bom motivo.

---

## Parte 2 — O que dá para fazer, e é exatamente o que você pediu

### A ideia

O "Pix Copia e Cola" **não é um serviço**. É um **texto**, montado segundo o
padrão EMV/BR Code do Banco Central, contendo a sua chave Pix, o seu nome, a
cidade e o valor. O QR Code é só esse mesmo texto desenhado.

Quer dizer: **o Gaveta consegue gerar o código sozinho**, sem API, sem
cadastro, sem intermediário e sem depender de estar online. O cliente lê o
QR, o dinheiro vai **direto da conta dele para a sua conta Nubank**, sem
passar por ninguém no meio.

### Provado, não suposto

Escrevi o gerador e conferi contra uma **biblioteca independente**
(`pix-utils`), nos mesmos dados:

| Caso | Chave | Valor | Resultado |
| --- | --- | --- | --- |
| Mercearia do Adriano | e-mail | R$ 47,90 | ✅ idêntico |
| Ana Silva | CPF | R$ 25,75 | ✅ idêntico |
| Loja Teste | telefone | R$ 1.234,56 | ✅ idêntico |
| Fulano de Tal | chave aleatória | R$ 15,00 | ✅ idêntico |

Os dois geradores produzem a **mesma string, byte a byte**, nos quatro tipos
de chave. O CRC16 do meu gerador também bate o vetor oficial da norma
(`"123456789"` → `29B1`).

> **Detalhe que quase passou batido:** o identificador tem de ser
> `br.gov.bcb.pix` em **minúsculas**. Com maiúsculas a estrutura fica certa
> mas o código sai diferente. Foi a única divergência entre os dois
> geradores, e vale registrar para não se perder tempo com ela depois.

Exemplo real gerado, R$ 47,90 com referência da venda:

```
00020126490014br.gov.bcb.pix0127<chave>520400005303986540547.90
5802BR5920MERCEARIA DO ADRIANO6009SAO PAULO62140510GAVETA10426304 4790
```

São 152 caracteres. O QR é isso desenhado.

### Custo

**Zero, e confirmado na fonte.** A [página do Pix Nu Empresas](https://nubank.com.br/empresas/conta/pix)
diz que "todas as transações via Pix que seu negócio precisar são gratuitas"
e que o dinheiro "cai em segundos na sua conta Nu Empresas sem taxas", sem
limite de recebimento. Para pessoa física, a gratuidade é regra do Banco
Central.

*A conferir no seu contrato:* há relato de banco digital cobrando acima de um
volume mensal. Vale olhar o seu extrato antes de considerar isso fechado.

### O que fica de fora, e é o ponto honesto deste estudo

**O Gaveta não vai saber que o dinheiro chegou.** Sem API, não existe aviso
de volta. Na prática, o fluxo no caixa fica:

1. O caixa fecha a venda e escolhe "Pix".
2. A tela mostra o QR com **o valor já preenchido** e o botão de copiar.
3. O cliente paga; **o celular do dono apita a notificação do Nubank**.
4. O caixa confirma na tela, e a venda é registrada como paga.

O passo 4 é manual. Vale reparar que **é exatamente o que já acontece hoje**
— a diferença é que o valor deixa de ser digitado pelo cliente, que é de onde
vem o erro mais comum (pagar R$ 4,79 em vez de R$ 47,90). E a chave deixa de
ser ditada em voz alta.

---

## Parte 3 — Se um dia a confirmação automática valer a pena

Exige um **PSP com a API Pix do Banco Central**. O dinheiro passa a cair
**primeiro na conta desse PSP** e depois é transferido para o Nubank — é por
isso que isso é decisão de negócio, não escolha técnica.

| Opção | Tarifa de recebimento | Observação |
| --- | --- | --- |
| [Efí (ex-Gerencianet)](https://sejaefi.com.br/efi-pay/api-pix) | Baixa, por faixa | É o PSP **confirmado** na lista do BACEN há mais tempo; API `cob`/`cobv` com webhook e certificado `.p12`. |
| [Banco Inter Empresas](https://www.cnnbrasil.com.br/branded-content/economia/money/negocios/pix-gratuito-para-empresas-como-o-inter-se-diferencia-de-outros-bancos/) | Pix PJ gratuito | API própria; conta PJ no Inter. |
| [Asaas](https://www.asaas.com/pix-asaas) | 30 transações grátis/mês | Acima disso, tarifa por cobrança. |
| Cora | Conta PJ gratuita | Pix e boletos ilimitados. |

**Recomendação:** não fazer isso agora. O custo real dessa etapa não é a
tarifa — é trazer um terceiro para dentro do caminho do seu dinheiro,
gerenciar certificado, tratar webhook e lidar com conciliação divergente.
Isso só se paga depois que a confirmação manual **provar** ser um problema no
uso real.

---

## Recomendação

**Fazer a Etapa 1 e parar aí por enquanto.**

Ela entrega literalmente o que foi pedido — QR Code e Copia e Cola direto do
app, dinheiro na conta Nubank, taxa zero — sem dependência externa, sem
segredo novo guardado, sem mensalidade e sem nada que possa "sair do ar".

O único item da sua lista que ela não entrega é a baixa automática, que
**nenhuma solução entrega com o Nubank**, porque o Nubank não tem API. Para
ter isso seria preciso trocar de banco recebedor — e essa é uma decisão sua,
não uma limitação do Gaveta.

### Esboço do que a Etapa 1 envolve

| Peça | O quê |
| --- | --- |
| Preferências | Campo da chave Pix, nome do recebedor e cidade, validados com Zod no servidor. |
| `lib/pix/brcode.ts` | O gerador (provado acima). Sem dependência nova. |
| QR | Biblioteca de desenho de QR, ou geração no servidor. **Nunca** serviço externo de imagem: mandaria a chave Pix e o valor para fora. |
| Caixa | Forma de pagamento "Pix", tela com o QR, botão de copiar e confirmação manual. |
| Venda | Um estado "aguardando Pix" até o caixa confirmar. |

> **Ponto de segurança a respeitar:** a chave Pix é dado do dono da loja e
> vive sob RLS como o resto. E o QR **tem de ser gerado dentro do sistema** —
> qualquer gerador de QR de terceiro receberia a chave e o valor de cada
> venda.

---

## Fontes

- [Lista de PSPs recebedores com API Pix — repositório do BACEN](https://github.com/bacen/pix-api/discussions/187)
- [Pix Nu Empresas — página oficial do Nubank](https://nubank.com.br/empresas/conta/pix)
- [Consigo receber Pix com API no Nubank? — Woovi](https://ajuda.woovi.com/hc/duvidas-frequentes/articles/consigo-receber-pix-com-api-no-nubank)
- [Entendendo o payload do Pix Copia e Cola — TabNews](https://www.tabnews.com.br/usrbinenv/entendendo-o-payload-do-pix-copia-e-cola-e-gerando-um-qr-code-estatico)
- [API Pix da Efí](https://sejaefi.com.br/efi-pay/api-pix)
- [Pix PJ do Asaas](https://www.asaas.com/pix-asaas)
- [Pix gratuito para empresas no Inter — CNN Brasil](https://www.cnnbrasil.com.br/branded-content/economia/money/negocios/pix-gratuito-para-empresas-como-o-inter-se-diferencia-de-outros-bancos/)
- Pedidos de API no fórum do Nubank: [2023](https://comunidade.nubank.com.br/t/api-pix/323217) · [2024](https://comunidade.nubank.com.br/t/criação-de-uma-api-para-o-pix/292073) · [2025](https://comunidade.nubank.com.br/t/api-oficial-do-nubank-para-desenvolvedores/640431)
