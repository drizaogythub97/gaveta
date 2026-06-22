import { GavetaLoader } from "@/components/app/gaveta-loader";

// Boundary de carregamento compartilhado por toda a área autenticada: aparece
// nas transições entre telas e na carga inicial, sorteando um dos conceitos.
export default function Loading() {
  return <GavetaLoader />;
}
