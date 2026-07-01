// Service worker mínimo do Gaveta.
//
// Objetivo: satisfazer o critério de "app instalável" (PWA) do Chrome — que
// exige um service worker com handler de fetch — e habilitar a experiência
// em tela cheia (display: standalone) no celular.
//
// NÃO fazemos cache/offline de propósito: o Gaveta é online (a segurança vive
// no servidor via RLS/sessão) e cache de páginas autenticadas seria risco de
// vazar dados entre sessões. Este SW apenas repassa as requisições à rede.

self.addEventListener("install", () => {
  // Ativa a nova versão imediatamente, sem esperar abas antigas fecharem.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Passagem direta para a rede (sem cache).
  event.respondWith(fetch(event.request));
});
