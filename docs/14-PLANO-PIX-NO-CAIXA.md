# Plano: receber Pix na frente de caixa, taxa zero

Pedido do dono (24/09/2026): receber por Pix direto da frente de caixa,
com QR Code e Copia e Cola, caindo na conta **Nubank**, pagando **zero de
taxa**.

O porquê de não haver API está em `docs/13-ESTUDO-RECEBIMENTO-PIX.md`. Este
documento é o **como fazer**.

---

## A notícia boa: o plano é menor do que o estudo sugeria

Quando escrevi o estudo, imaginei que a venda precisaria de um estado novo
("aguardando Pix"). **Depois de ler a frente de caixa, não precisa.**

O caixa já funciona assim: monta o carrinho, escolhe a forma de pagamento,
e clica em **Finalizar venda** *quando a transação terminou*. Para dinheiro,
enquanto o carrinho está aberto, aparece a calculadora de troco. Para venda
a prazo, aparece o seletor de cliente.

**O Pix ocupa exatamente esse mesmo lugar**: escolheu "Pix" → aparece o QR
com o valor já preenchido. O cliente paga, o celular do dono apita, o caixa
clica em Finalizar. Igual a hoje.

Consequências, e são grandes:

- **Nenhuma mudança na tabela `sales`.** Sem status novo, sem migration no
  motor de vendas.
- **Nenhuma mudança na `register_sale`.** O `payment_method: "pix"` já
  existe e já é gravado.
- **Nenhuma mudança no fluxo que o dono já conhece.** Não há tela nova para
  aprender — aparece um painel onde ele já espera ver algo.
- **A taxa continua zero de verdade.** O `pix_pct` das preferências já tem
  padrão 0, e com chave Pix direta ele *é* 0 — não é uma estimativa, é o
  fato de não haver intermediário.

---

## As quatro peças

### 1. Onde a chave Pix mora

Uma migration acrescenta três colunas a `profiles`, que já guarda
`brand_name`, `brand_logo_path` e `theme`:

| Coluna | Para quê | Exemplo |
| --- | --- | --- |
| `pix_key` | a chave que recebe | `adriano@exemplo.com` |
| `pix_merchant_name` | nome que o cliente vê no app do banco dele | `MERCEARIA DO ADRIANO` |
| `pix_city` | exigência do padrão | `SAO PAULO` |

Fica sob a RLS que já protege `profiles` — nada de novo em segurança.

> **Por que não guardar só a chave?** O padrão EMV exige nome e cidade, e
> eles aparecem na tela do cliente na hora de pagar. Deixar o Gaveta
> inventar isso a partir da marca daria um nome errado no app do banco.

### 2. `lib/pix/brcode.ts` — o gerador

Já escrito e **provado**: validei contra a biblioteca independente
`pix-utils` e os dois produzem a **mesma string, byte a byte**, nos quatro
tipos de chave (CPF, e-mail, telefone e aleatória). O CRC16 bate o vetor
oficial da norma (`"123456789"` → `29B1`).

```ts
export function gerarPixCopiaECola({
  chave, nome, cidade, valor, txid,
}: DadosPix): string
```

Sem dependência nova. São ~40 linhas: monta os campos no formato
tamanho-valor e fecha com o CRC.

> ⚠️ **O detalhe que custa uma tarde se for esquecido:** o identificador é
> `br.gov.bcb.pix` em **minúsculas**. Com maiúsculas a estrutura fica certa
> e o código sai diferente — foi a única divergência entre os dois
> geradores na validação.

### 3. Validação da chave (Zod, no servidor)

A chave tem cinco formatos, e o BR Code exige cada um numa forma canônica:

| Tipo | O que o dono digita | O que vai no código |
| --- | --- | --- |
| CPF | `123.456.789-01` | `12345678901` |
| CNPJ | `12.345.678/0001-90` | `12345678000190` |
| Telefone | `(11) 99999-8888` | `+5511999998888` |
| E-mail | `ana@loja.com` | igual |
| Aleatória | o UUID que o banco deu | igual |

Validar isto importa mais do que parece: **uma chave errada gera um QR
válido que manda dinheiro para outra pessoa**. O schema precisa reconhecer
o tipo e normalizar, e a tela precisa mostrar qual tipo foi reconhecido
para o dono conferir antes de salvar.

### 4. O painel no caixa

Entra em `pos-client.tsx`, ao lado de onde o painel do fiado já aparece:

```tsx
{isPix ? <PainelPix total={total} config={pixConfig} /> : null}
```

O painel mostra:

- **O QR**, grande o bastante para outro celular ler da tela;
- **O botão de copiar** o Copia e Cola, para quem prefere colar;
- **O valor**, repetido em número grande, para conferência;
- Se a chave não estiver cadastrada, **um atalho para as preferências** em
  vez de um painel vazio.

**O código é calculado no navegador**, não no servidor. O total muda a cada
item que entra no carrinho, e uma ida ao servidor por item deixaria o caixa
lento — que é justamente o que passamos a sprint passada consertando. O
cálculo é aritmética de texto, instantâneo.

**O QR é desenhado localmente**, com a biblioteca carregada só nesta tela
(`import()` dinâmico, para não pesar nas outras).

> 🔒 **Nunca um gerador de QR de terceiro.** Existem serviços que devolvem
> a imagem por URL. Usar um deles mandaria a chave Pix e o valor de **cada
> venda** para fora. Isso está fora de questão.

---

## Fases

Cada uma é entregável sozinha, no padrão do projeto.

### Fase P1 — A chave e o gerador *(sem nada visível ainda)*

- Migration com as três colunas em `profiles`.
- `lib/pix/brcode.ts` + `lib/validations/pix.ts`.
- Testes unitários: os quatro tipos de chave, o CRC, acento e limite de
  tamanho no nome, e o caso do valor com centavos.
- **Guarda:** um teste que compara a saída com os vetores validados contra
  a `pix-utils`, para que uma mudança futura no gerador não passe calada.

### Fase P2 — Cadastrar a chave

- `app/(app)/preferencias/sections/pix-section.tsx`, no molde do
  `fees-section.tsx` que já existe.
- Mostra o tipo reconhecido ("Isto é um e-mail") antes de salvar.
- **Pré-visualização do QR na própria tela de preferências**, para o dono
  testar com o celular dele antes de usar num cliente de verdade.

### Fase P3 — O painel no caixa

- `PainelPix` e o `isPix` no `pos-client.tsx`.
- `caixa/page.tsx` passa a carregar a configuração de Pix junto das outras
  quatro consultas que já vão em `Promise.all` — **sem ida a mais ao
  banco**.
- Conferência visual nos três modos (desktop, mobile e Minimalista), com
  foto de referência, como foi feito no PR #58.

### Fase P4 — Acabamento *(opcional, decidir depois de usar)*

- `txid` por venda, para conciliar o extrato depois.
- Um contador discreto de "Pix gerados hoje" no fechamento de caixa.

---

## O que este plano **não** entrega, dito com todas as letras

**O Gaveta não vai saber sozinho que o dinheiro caiu.** O caixa confirma
vendo a notificação do Nubank — como já faz hoje.

O que muda, e não é pouco:

- o valor **deixa de ser digitado pelo cliente**, que é de onde vem o erro
  mais comum (pagar R$ 4,79 em vez de R$ 47,90);
- a chave **deixa de ser ditada em voz alta** ou mostrada num papel;
- o cliente paga olhando o **nome da loja** na tela do banco dele, o que
  dá confiança.

Baixa automática só existe com um PSP que tenha a API do Banco Central — e
aí o dinheiro passa a cair **primeiro na conta desse PSP**, não no Nubank.
As opções estão levantadas no `docs/13`. **A recomendação é não fazer
agora**, e reavaliar só se a confirmação manual virar um problema de
verdade no uso diário.

---

## Riscos, e como cada um é tratado

| Risco | Tratamento |
| --- | --- |
| Chave digitada errada manda dinheiro para outra pessoa | Validação por tipo + **pré-visualização do QR** na Fase P2, para o dono testar com o celular dele antes |
| QR não lido por algum banco | O gerador foi validado contra implementação independente nos 4 tipos de chave |
| Caixa lento por causa do QR | Cálculo no navegador; biblioteca carregada só nesta tela |
| Chave vazar para terceiro | Nada de serviço externo de QR; a chave sai do banco sob RLS e é desenhada no próprio aparelho |
| Confirmação manual esquecida | O caixa só finaliza a venda depois de conferir — é o mesmo gesto de hoje |

---

## Estimativa

| Fase | Tamanho |
| --- | --- |
| P1 — chave e gerador | pequena |
| P2 — cadastrar | pequena |
| P3 — painel no caixa | média (é onde mora a conferência visual) |
| P4 — acabamento | pequena, e opcional |

Uma migration só, na Fase P1, e ela **não toca** em nada que o FiadoApp
use — `profiles` é do Gaveta.

**Pronto para começar pela P1 assim que você der o aceite.**
