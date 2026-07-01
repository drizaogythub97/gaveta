import { NextResponse } from "next/server";

// Digital Asset Links: prova que este domínio autoriza o app Android (TWA) a
// abrir suas URLs sem a barra do navegador. O Google lê este arquivo em
// https://<dominio>/.well-known/assetlinks.json.
//
// Pacote e fingerprint(s) SHA-256 vêm de variáveis de ambiente (defina na
// Vercel após gerar o AAB com o Bubblewrap). Enquanto não definidas, devolve
// uma lista vazia (JSON válido e inofensivo). Aceita múltiplos fingerprints
// separados por vírgula (ex.: chave de upload + chave do Play App Signing).

export const dynamic = "force-dynamic";

export function GET() {
  const packageName = process.env.ANDROID_PACKAGE_NAME?.trim();
  const fingerprints = (process.env.ANDROID_CERT_FINGERPRINT ?? "")
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);

  if (!packageName || fingerprints.length === 0) {
    return NextResponse.json([]);
  }

  return NextResponse.json([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: packageName,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ]);
}
