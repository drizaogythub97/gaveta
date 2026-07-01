# 07 — Mobile: PWA instalável + TWA na Play Store (Fase H revisada)

O objetivo original da Fase H (app nativo Kotlin) era o uso **offline com
sincronização**. Esse requisito foi **descontinuado** (2026-06-26), então não há
mais motivo para um segundo codebase. Em vez disso, o Gaveta é entregue no
celular como **PWA** (Progressive Web App) — o mesmo app web, instalável e em
tela cheia — e, opcionalmente, empacotado como **TWA** (Trusted Web Activity)
para a **Google Play Store**.

## Por que PWA/TWA (e não WebView cru)

- A segurança do Gaveta é **server-side** (RLS por `user_id`, `getUser()`,
  headers/CSP, rate limiting). Ela **não depende** de o cliente ser nativo.
- PWA e TWA rodam no **Chrome real** do aparelho → CSP, cookies seguros e engine
  atualizada, **iguais ao navegador**. Um WebView customizado só adicionaria
  risco (pontes JS↔nativo) sem nenhum ganho, já que não há offline/hardware.

## O que já está no app (parte web, nesta fase)

- **Service worker mínimo** (`public/sw.js`) + registro (`components/app/
  pwa-register.tsx`): habilita "instalar" e tela cheia. **Sem cache/offline** de
  propósito (páginas autenticadas não devem ser cacheadas).
- **Leitura de código de barras pela câmera** na frente de caixa
  (`components/app/barcode-scanner.tsx`, botão "Escanear com a câmera"), com
  detecção de suporte (`BarcodeDetector`). No desktop, o leitor USB segue igual.
  - Header ajustado: `Permissions-Policy: camera=(self)` (`next.config.ts`).
- **Compartilhar comprovante** (Web Share) na tela `/comprovante/[saleId]`:
  envia o comprovante **em texto** (WhatsApp, e-mail…). A rota é privada por RLS,
  então compartilha-se o conteúdo, não o link. `window.print()` continua para
  PDF/impressão.
- **Endpoint Digital Asset Links**: `/.well-known/assetlinks.json`
  (`app/.well-known/assetlinks.json/route.ts`) — lê pacote e fingerprint de
  variáveis de ambiente (ver abaixo).

## Instalar como PWA (sem loja) — já funciona

No **Chrome do Android**, abra `https://gaveta-erp.vercel.app`, menu ⋮ →
**"Adicionar à tela inicial" / "Instalar app"**. Abre em tela cheia, com ícone
próprio. (No iOS: Safari → Compartilhar → "Adicionar à Tela de Início".)

## Publicar na Play Store (TWA) — passo a passo

Pré-requisitos: **Node** (já instalado) e uma conta **Google Play Console**
(taxa única de US$ 25). O Bubblewrap **baixa o próprio JDK e o Android SDK**, não
precisa do Android Studio.

1. **Instale o Bubblewrap:**
   ```bash
   npm i -g @bubblewrap/cli
   ```

2. **Inicialize o projeto TWA** (na pasta `twa/` deste repo já há um
   `twa-manifest.json` de partida; ajuste o `packageId` se quiser):
   ```bash
   cd twa
   bubblewrap init --manifest https://gaveta-erp.vercel.app/manifest.webmanifest
   ```
   Responda os prompts (nome, `packageId` — ex.: `app.gaveta_erp.twa`, cor, etc.).
   Na primeira vez ele oferece instalar JDK/SDK automaticamente — aceite.

3. **Gere o pacote assinado:**
   ```bash
   bubblewrap build
   ```
   Isso cria/usa uma **keystore** (guarde-a e à senha com cuidado — é a
   identidade do app) e produz `app-release-signed.aab` (para a loja) e um `.apk`
   (para testar no aparelho: `adb install app-release-signed.apk`).

4. **Pegue o fingerprint SHA-256 da assinatura:**
   ```bash
   bubblewrap fingerprint list
   ```
   (ou `keytool -list -v -keystore android.keystore`). Copie o valor
   `SHA256` no formato `AA:BB:CC:...`.

5. **Ative o Digital Asset Links** definindo as variáveis na **Vercel**
   (Project → Settings → Environment Variables, ambiente Production):
   - `ANDROID_PACKAGE_NAME` = o `packageId` usado (ex.: `app.gaveta_erp.twa`)
   - `ANDROID_CERT_FINGERPRINT` = o SHA-256 copiado
   - Faça um redeploy. Confira em
     `https://gaveta-erp.vercel.app/.well-known/assetlinks.json` (deve listar o
     pacote + fingerprint) e valide no
     [Statement List Generator](https://developers.google.com/digital-asset-links/tools/generator).

6. **Publique** o `app-release-signed.aab` na Play Console (novo app → produção
   ou teste interno). Se ativar o **Play App Signing** (recomendado pelo Google),
   a loja usa uma **segunda** chave: pegue o SHA-256 do "App signing key" na
   Play Console e **acrescente-o** ao `ANDROID_CERT_FINGERPRINT` (separado por
   vírgula) — o endpoint aceita múltiplos fingerprints.

## Notas de segurança

- Nada muda no modelo server-side (RLS/`getUser()`/headers). O TWA é só um
  invólucro do Chrome sobre o mesmo site.
- `camera=(self)` libera a câmera apenas para o próprio domínio.
- O service worker **não** faz cache — evita vazar dados de sessões autenticadas.
- `frame-ancestors 'none'` segue protegendo contra embutir o site em iframes de
  terceiros (o TWA carrega como documento de topo, não é afetado).
