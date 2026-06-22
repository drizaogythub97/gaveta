/**
 * Transição discreta entre as telas de autenticação (login, cadastro,
 * recuperação). Só anima com `motion-safe` — respeita "reduzir movimento".
 */
export default function AuthTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300 motion-safe:ease-out">
      {children}
    </div>
  );
}
