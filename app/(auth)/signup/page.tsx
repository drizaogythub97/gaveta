import Link from "next/link";
import { redirect } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

import { SignupForm } from "./signup-form";

export const metadata = {
  title: "Criar conta",
};

export default async function SignupPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <Card className="p-6">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Criar conta</CardTitle>
        <CardDescription className="text-base">
          É grátis e leva menos de um minuto.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <SignupForm />
        <p className="text-muted-foreground text-center text-base">
          Já tem uma conta?{" "}
          <Link
            href="/login"
            className="text-primary font-medium underline underline-offset-4 hover:no-underline"
          >
            Entrar
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
