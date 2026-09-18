import Image from "next/image";

// Import estático: a logo ganha URL com hash e cache imutável, em vez de
// ser perguntada ao servidor a cada abertura. Ver app/(app)/layout.tsx.
import logoColorida from "@/public/logo-mark.png";
import logoBranca from "@/public/logo-mono-white.png";

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
        src={logoColorida}
        alt=""
        width={192}
        height={192}
        priority
        className="size-48 object-contain dark:hidden"
      />
      <Image
        src={logoBranca}
        alt=""
        width={192}
        height={192}
        priority
        className="hidden size-48 object-contain dark:block"
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
