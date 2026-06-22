/**
 * `template.tsx` é remontado a cada navegação (diferente de `layout.tsx`), então
 * é o lugar certo para a transição de telas. A animação é discreta (fade + leve
 * subida) e **só roda com `motion-safe`** — quem ativa "reduzir movimento" no
 * sistema vê a troca instantânea, sem animação (requisito de acessibilidade).
 */
export default function AppTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-300 motion-safe:ease-out">
      {children}
    </div>
  );
}
