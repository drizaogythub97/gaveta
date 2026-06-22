# Gaveta — Guia de marca

Identidade visual do produto **Gaveta**. As cores seguem exatamente os tokens
do sistema (`app/globals.css`) — a marca acompanha o app, não o contrário.

> Atenção: a marca do **produto** ("Gaveta") é diferente da marca **por loja**
> (`brand_name` / logo que cada usuário personaliza em Preferências). Não
> misturar.

## Cores

| Uso | Hex | Token do sistema |
|---|---|---|
| Verde primário (claro) | `#1B7A43` | `--primary` |
| Verde primário (escuro) | `#2FA05F` | `--primary` (dark) |
| Tinta / preto | `#1A1A1A` | `--foreground` |
| Branco / fundo | `#FFFFFF` | `--background` |
| Apoio: sucesso | `#15803D` | `--success` |
| Apoio: aviso | `#B45309` | `--warning` |
| Apoio: erro | `#B91C1C` | `--destructive` |
| Texto secundário | `#4B5563` | `--muted-foreground` |
| Borda | `#D1D5DB` | `--border` |

Acessibilidade: `#1B7A43` sobre branco tem contraste ~5,4:1 → passa em **AA**
para texto normal. Evitar verde em texto pequeno sobre fundos médios.

## Arquivos

| Arquivo | Para que serve |
|---|---|
| `icon-master.png` (1024) | Mestre do ícone (fundo branco, full-bleed) |
| `icon-512.png`, `icon-192.png` | Ícones PWA (`purpose: any`) |
| `icon-maskable-512.png`, `icon-maskable-192.png` | Ícones PWA `maskable` (conteúdo na área de segurança ~78%) |
| `apple-touch-icon.png` (180) | iOS (sem transparência) |
| `favicon.ico` (16/32/48) + `favicon-16/32/48.png` | Favicon do site |
| `og-image.png` (1200×630) | Compartilhamento social / OpenGraph |
| `wordmark-horizontal.png` | Logo + "Gaveta" lado a lado (fundos claros) |
| `wordmark-stacked.png` | Logo + "Gaveta" empilhado (fundos claros) |
| `logo-mark.png` | Só a marca, colorida, fundo transparente |
| `logo-mono-ink.png` | Marca monocromática em tinta (fundos claros) |
| `logo-mono-white.png` | Marca monocromática em branco (fundos escuros) |

Tipografia do wordmark: **Inter Bold** (a mesma família do app).
O texto "Frente de caixa e gestão simples" no OG é um descritor provisório —
ajustar quando houver tagline oficial.

## Uso

- Espaço livre mínimo ao redor da marca: a altura do "G".
- Tamanho mínimo: ícone ≥ 32px; wordmark ≥ 120px de largura.
- Em fundo escuro, usar `logo-mono-white.png` (a marca colorida tem partes em
  tinta que somem no escuro).

## Não fazer

- Não trocar as cores nem usar o verde antigo `#00A651`.
- Não distorcer, rotacionar ou aplicar sombra/gradiente.
- Não recolorir o texto do wordmark fora de tinta/branco.
- Não colocar a marca colorida (com preto) sobre fundo escuro.

## Integração (a fazer no Claude Code, em branch)

- Substituir `app/favicon.ico` e adicionar `app/icon.png` / `app/apple-icon.png`.
- Criar `manifest.webmanifest` referenciando os ícones (incl. `maskable`).
- Definir `metadata` (title/openGraph) com `og-image.png` e nome "Gaveta".
- Exibir "Gaveta" na interface (separado do `brand_name` por loja).
