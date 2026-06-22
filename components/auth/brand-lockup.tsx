import Image from "next/image";

/**
 * Bloco de marca do produto "Gaveta" (logo + nome + slogan) exibido no topo
 * dos cartões de autenticação. É a marca do PRODUTO — separada do nome/logo
 * por loja que cada usuário personaliza em Preferências.
 */
export function BrandLockup() {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      {/* Marca colorida no claro; versão branca no escuro (ver BRAND.md). */}
      <Image
        src="/logo-mark.png"
        alt=""
        width={64}
        height={64}
        priority
        className="size-16 dark:hidden"
      />
      <Image
        src="/logo-mono-white.png"
        alt=""
        width={64}
        height={64}
        priority
        className="hidden size-16 dark:block"
      />
      <span className="text-foreground text-2xl font-bold tracking-tight">
        Gaveta
      </span>
      <span className="text-muted-foreground text-base">
        ERP de uso simples, guarde e lucre.
      </span>
    </div>
  );
}
