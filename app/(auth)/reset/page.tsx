import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { ResetForm } from "./reset-form";

export const metadata = {
  title: "Nova senha",
};

export default function ResetPage() {
  return (
    <Card className="p-6">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Definir nova senha</CardTitle>
        <CardDescription className="text-base">
          Escolha uma senha de pelo menos 8 caracteres.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResetForm />
      </CardContent>
    </Card>
  );
}
