// Service worker mínimo do Gaveta.
//
// Objetivo: satisfazer o critério de "app instalável" (PWA) do Chrome — que
// exige um service worker com handler de fetch — e habilitar a experiência
// em tela cheia (display: standalone) no celular.
//
// NÃO fazemos cache/offline de propósito: o Gaveta é online (a segurança vive
// no servidor via RLS/sessão) e cache de páginas autenticadas seria risco de
// vazar dados entre sessões.

self.addEventListener("install", () => {
  // Ativa a nova versão imediatamente, sem esperar abas antigas fecharem.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// O handler EXISTE — é ele que torna o app instalável —, mas de propósito
// não chama `respondWith`. Sem `respondWith` o navegador segue o caminho
// nativo: cache HTTP, conexão já aberta, tudo como se o worker não
// estivesse no meio.
//
// Antes aqui havia `event.respondWith(fetch(event.request))`, que chega ao
// mesmo resultado pelo caminho mais longo: as 30 requisições de uma abertura
// (medidas) passavam a ser proxiadas pelo worker, que ainda precisa acordar
// antes de responder. Repassar à rede não é trabalho do worker; é o que o
// navegador já faz sozinho.
self.addEventListener("fetch", () => {});
