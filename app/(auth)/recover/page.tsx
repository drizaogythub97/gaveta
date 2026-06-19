import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { RecoverForm } from "./recover-form";

export const metadata = {
  title: "Recuperar senha — ERP Simples",
};

export default function RecoverPage() {
  return (
    <Card className="p-6">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Recuperar senha</CardTitle>
        <CardDescription className="text-base">
          Informe seu e-mail e enviaremos um link para criar uma nova senha.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <RecoverForm />
        <p className="text-muted-foreground text-center text-base">
          Lembrou a senha?{" "}
          <Link
            href="/login"
            className="text-primary font-medium underline underline-offset-4 hover:no-underline"
          >
            Voltar para entrar
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
