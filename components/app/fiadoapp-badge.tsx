import Image from "next/image";

/**
 * Badge de referência ao FiadoApp (ponte do ecossistema). Cor VERMELHA/coral
 * + logo do FiadoApp — as badges de referência usam a cor/marca do OUTRO app,
 * criando o contraste de integração (o Gaveta é verde; o FiadoApp, coral).
 * Reutilizada no caixa (venda a prazo) e no financeiro (Fase 2).
 */
export function FiadoappBadge({
  rotulo = "Integração FiadoApp",
  className,
}: {
  rotulo?: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-900 dark:bg-red-500/15 dark:text-red-300 ${className ?? ""}`}
    >
      <span className="inline-flex size-4 items-center justify-center rounded-[3px] bg-white p-px">
        <Image
          src="/fiadoapp-logo.png"
          alt=""
          width={16}
          height={16}
          className="size-full object-contain"
        />
      </span>
      {rotulo}
    </span>
  );
}
