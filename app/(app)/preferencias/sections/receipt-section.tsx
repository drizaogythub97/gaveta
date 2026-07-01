"use client";

import { useState } from "react";

import { Receipt } from "@/components/receipt/receipt";
import { ErrorAlert, SuccessAlert } from "@/components/auth/form-feedback";
import { SubmitButton } from "@/components/auth/submit-button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  RECEIPT_FOOTER_MAX,
  RECEIPT_PAPERS,
  RECEIPT_PAPER_LABELS,
  type ReceiptData,
  type ReceiptPaper,
  type ReceiptPrefs,
} from "@/lib/receipt/types";

import { saveReceiptPrefs, type ReceiptFormState } from "../actions";

type Props = {
  initialPrefs: ReceiptPrefs;
  brandName: string | null;
  logoUrl: string | null;
};

// Venda fictícia usada só para a pré-visualização do comprovante.
const SAMPLE: ReceiptData = {
  id: "a1b2c3d4-0000-0000-0000-000000000000",
  createdAt: new Date().toISOString(),
  status: "completed",
  paymentMethod: "dinheiro",
  installments: null,
  subtotal: 27.5,
  discount: 2.5,
  total: 25,
  items: [
    { name: "Pão francês", quantity: 0.5, unitPrice: 15, lineTotal: 7.5 },
    { name: "Refrigerante lata", quantity: 2, unitPrice: 6, lineTotal: 12 },
    { name: "Café", quantity: 1, unitPrice: 8, lineTotal: 8 },
  ],
};

export function ReceiptSection({ initialPrefs, brandName, logoUrl }: Props) {
  const [paper, setPaper] = useState<ReceiptPaper>(initialPrefs.paper);
  const [showLogo, setShowLogo] = useState(initialPrefs.showLogo);
  const [showName, setShowName] = useState(initialPrefs.showName);
  const [footer, setFooter] = useState(initialPrefs.footer ?? "");
  const [feedback, setFeedback] = useState<ReceiptFormState>({});

  async function handleSave(formData: FormData) {
    const result = await saveReceiptPrefs({}, formData);
    setFeedback(result);
  }

  const previewPrefs: ReceiptPrefs = {
    paper,
    showLogo,
    showName,
    footer: footer.trim() ? footer : null,
  };

  return (
    <section
      aria-labelledby="receipt-heading"
      className="ring-foreground/10 bg-card flex flex-col gap-4 rounded-xl p-5 ring-1"
    >
      <header>
        <h2 id="receipt-heading" className="text-xl font-semibold">
          Impressão de comprovante
        </h2>
        <p className="text-muted-foreground text-base">
          Escolha o tamanho do papel e o que aparece no comprovante da venda.
          Ele não tem valor fiscal.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        {/* Formulário */}
        <form action={handleSave} className="flex flex-col gap-5">
          {feedback.error ? <ErrorAlert message={feedback.error} /> : null}
          {feedback.ok ? (
            <SuccessAlert message="Preferências de impressão salvas." />
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="paper" className="text-base">
              Tamanho do papel
            </Label>
            <select
              id="paper"
              name="paper"
              value={paper}
              onChange={(e) => setPaper(e.target.value as ReceiptPaper)}
              className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-14 w-full rounded-lg border px-3 text-lg outline-none focus-visible:ring-3 sm:max-w-md"
            >
              {RECEIPT_PAPERS.map((p) => (
                <option key={p} value={p}>
                  {RECEIPT_PAPER_LABELS[p]}
                </option>
              ))}
            </select>
          </div>

          <fieldset className="flex flex-col gap-3">
            <legend className="text-base font-medium">
              O que mostrar no cabeçalho
            </legend>
            {/* Hidden inputs garantem o valor enviado (checkbox é controlada). */}
            <input
              type="hidden"
              name="show_name"
              value={showName ? "on" : ""}
            />
            <input
              type="hidden"
              name="show_logo"
              value={showLogo ? "on" : ""}
            />
            <label className="flex items-center gap-3 text-base">
              <Checkbox
                checked={showName}
                onCheckedChange={(v) => setShowName(v === true)}
              />
              <span>Nome da loja</span>
            </label>
            <label className="flex items-center gap-3 text-base">
              <Checkbox
                checked={showLogo}
                onCheckedChange={(v) => setShowLogo(v === true)}
                disabled={!logoUrl}
              />
              <span>
                Logo da loja
                {!logoUrl ? (
                  <span className="text-muted-foreground ml-1 text-sm">
                    (envie uma logo acima para usar)
                  </span>
                ) : null}
              </span>
            </label>
          </fieldset>

          <div className="flex flex-col gap-2">
            <Label htmlFor="footer" className="text-base">
              Mensagem de rodapé (opcional)
            </Label>
            <textarea
              id="footer"
              name="footer"
              value={footer}
              onChange={(e) => setFooter(e.target.value)}
              maxLength={RECEIPT_FOOTER_MAX}
              rows={2}
              placeholder="Ex.: Obrigado pela preferência! Volte sempre."
              className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-lg border px-3 py-2 text-base outline-none focus-visible:ring-3"
            />
            <p className="text-muted-foreground text-sm">
              {`Até ${RECEIPT_FOOTER_MAX} caracteres.`} O aviso &ldquo;não tem
              valor fiscal&rdquo; é sempre incluído.
            </p>
          </div>

          <SubmitButton className="sm:max-w-xs" pendingText="Salvando…">
            Salvar impressão
          </SubmitButton>
        </form>

        {/* Pré-visualização */}
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-sm font-medium">
            Pré-visualização
          </p>
          <div className="bg-muted flex justify-center overflow-x-auto rounded-lg p-4">
            <div
              className="shadow-sm"
              style={{
                width: paper === "a4" ? "150mm" : "fit-content",
                maxWidth: "100%",
              }}
            >
              <Receipt
                data={SAMPLE}
                prefs={previewPrefs}
                brand={{ name: brandName, logoUrl }}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
