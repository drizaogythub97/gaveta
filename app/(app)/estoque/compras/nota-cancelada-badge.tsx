/**
 * Selo de nota cancelada (estorno, fase G2a.1). Usado na lista de notas e
 * no detalhe, para o estado ficar óbvio à primeira olhada — a nota não é
 * apagada, então o selo é o que a distingue de uma nota válida.
 */
export function NotaCanceladaBadge() {
  return (
    <span className="border-destructive/40 bg-destructive/10 text-destructive inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold">
      Cancelada
    </span>
  );
}
