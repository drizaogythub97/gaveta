import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export const metadata = {
  title: "Política de Privacidade — ERP Simples",
};

export default function PrivacidadePage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <div className="mb-6">
        <Link
          href="/login"
          className={buttonVariants({
            variant: "ghost",
            className: "h-12 px-4 text-base",
          })}
        >
          ← Voltar
        </Link>
      </div>

      <article className="prose prose-lg max-w-none">
        <h1 className="text-3xl font-semibold tracking-tight">
          Política de Privacidade
        </h1>
        <p className="text-muted-foreground text-base">
          Última atualização: a definir na publicação.
        </p>

        <p className="mt-6 text-lg leading-relaxed">
          Esta Política explica, de forma simples, como o{" "}
          <strong>ERP Simples</strong> trata seus dados. Ao criar uma conta,
          você declara que leu e concorda com este documento (exigência da Lei
          nº 13.709/2018 — LGPD).
        </p>

        <h2 className="mt-8 text-2xl font-semibold">1. Quem somos</h2>
        <p className="text-lg leading-relaxed">
          O ERP Simples é um sistema de gestão pessoal de produtos e vendas,
          mantido por Adriano Cardoso como projeto de portfólio. Contato:
          adriano.cardoso97@gmail.com.
        </p>

        <h2 className="mt-8 text-2xl font-semibold">
          2. Quais dados coletamos
        </h2>
        <p className="text-lg leading-relaxed">
          Coletamos o mínimo necessário para o funcionamento:
        </p>
        <ul className="ml-6 list-disc space-y-2 text-lg leading-relaxed">
          <li>
            <strong>E-mail:</strong> para criar e acessar sua conta.
          </li>
          <li>
            <strong>Nome</strong> (opcional): para personalizar a saudação.
          </li>
          <li>
            <strong>Dados que você cadastra no uso:</strong> seus produtos,
            vendas e valores. Esses dados são seus e ficam isolados da conta de
            qualquer outro usuário.
          </li>
          <li>
            <strong>Data do aceite</strong> desta política.
          </li>
        </ul>
        <p className="text-lg leading-relaxed">
          Não coletamos dados sensíveis (saúde, biometria, origem racial, etc.)
          nem dados de pagamento.
        </p>

        <h2 className="mt-8 text-2xl font-semibold">3. Para que usamos</h2>
        <ul className="ml-6 list-disc space-y-2 text-lg leading-relaxed">
          <li>Autenticar seu acesso e manter sua conta.</li>
          <li>Armazenar e exibir os produtos e vendas que você registra.</li>
          <li>Gerar seus relatórios de faturamento.</li>
        </ul>
        <p className="text-lg leading-relaxed">
          Não vendemos nem compartilhamos seus dados com terceiros para
          marketing.
        </p>

        <h2 className="mt-8 text-2xl font-semibold">4. Onde os dados ficam</h2>
        <p className="text-lg leading-relaxed">
          Os dados são armazenados em servidores do <strong>Supabase</strong>{" "}
          (infraestrutura em nuvem), com criptografia em trânsito (HTTPS) e em
          repouso. O acesso é protegido por isolamento no nível do banco de
          dados (Row Level Security):{" "}
          <strong>cada usuário só acessa os próprios dados</strong>.
        </p>

        <h2 className="mt-8 text-2xl font-semibold">5. Seus direitos (LGPD)</h2>
        <p className="text-lg leading-relaxed">
          Você pode, a qualquer momento:
        </p>
        <ul className="ml-6 list-disc space-y-2 text-lg leading-relaxed">
          <li>
            <strong>Acessar</strong> e <strong>corrigir</strong> seus dados pela
            própria interface.
          </li>
          <li>
            <strong>Excluir sua conta</strong> e todos os dados associados, de
            forma permanente.
          </li>
          <li>
            Solicitar informações sobre o tratamento pelo e-mail de contato.
          </li>
        </ul>

        <h2 className="mt-8 text-2xl font-semibold">6. Retenção</h2>
        <p className="text-lg leading-relaxed">
          Mantemos seus dados enquanto sua conta existir. Ao excluir a conta, os
          dados são apagados de forma permanente e em cascata.
        </p>

        <h2 className="mt-8 text-2xl font-semibold">7. Cookies</h2>
        <p className="text-lg leading-relaxed">
          Usamos apenas cookies essenciais para manter sua sessão de login
          (autenticação). Não usamos cookies de publicidade ou rastreamento.
        </p>

        <h2 className="mt-8 text-2xl font-semibold">8. Alterações</h2>
        <p className="text-lg leading-relaxed">
          Esta política pode ser atualizada. Mudanças relevantes serão
          comunicadas na aplicação.
        </p>
      </article>
    </main>
  );
}
