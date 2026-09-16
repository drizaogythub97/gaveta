# Medição de desempenho em produção

Roda contra `https://gaveta-erp.vercel.app` com um usuário **descartável**
(criado e apagado pelo próprio script, como no e2e) e imprime uma linha
`RESULTADO_JSON` com: TTFB e carga completa de cada tela, navegação interna,
e o tempo da busca do caixa da última tecla até a lista aparecer.

```bash
npx playwright test -c scripts/desempenho/playwright.config.ts
```

Precisa do `.env.local` (chaves do Supabase, inclusive a `service_role`, só
para criar/apagar o usuário de teste). Para medir um Preview, troque o
`baseURL` no config e acrescente o cabeçalho de bypass como no
`playwright.config.ts` da raiz.

Os números de referência (16/09/2026, antes de qualquer mudança) estão em
`docs/11-PROGNOSTICO-DESEMPENHO.md`.
