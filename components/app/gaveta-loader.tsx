"use client";

import Image from "next/image";
import { useState } from "react";

import styles from "./gaveta-loader.module.css";

const VARIANTS = ["pulse", "growth", "ring"] as const;
type Variant = (typeof VARIANTS)[number];

function pickVariant(): Variant {
  return VARIANTS[Math.floor(Math.random() * VARIANTS.length)];
}

/** Logo da marca: colorida no claro, branca no escuro. */
function Logo({ size, className }: { size: number; className?: string }) {
  return (
    <>
      <Image
        src="/logo-mark.png"
        alt=""
        width={size}
        height={size}
        priority
        className={`object-contain dark:hidden ${className ?? ""}`}
        style={{ width: size, height: size }}
      />
      <Image
        src="/logo-mono-white.png"
        alt=""
        width={size}
        height={size}
        priority
        className={`hidden object-contain dark:block ${className ?? ""}`}
        style={{ width: size, height: size }}
      />
    </>
  );
}

function Coin({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="18" fill="#1b7a43" />
      <circle
        cx="20"
        cy="20"
        r="14"
        fill="none"
        stroke="#ffffff"
        strokeWidth="1.5"
        opacity="0.6"
      />
      <text
        x="20"
        y="27"
        textAnchor="middle"
        fontFamily="Inter, Arial"
        fontSize="20"
        fontWeight="800"
        fill="#ffffff"
      >
        $
      </text>
    </svg>
  );
}

function PulseScene() {
  return (
    <div className="relative flex h-64 w-full max-w-sm items-center justify-center">
      <span className={styles.pulseOpacity}>
        <Logo size={96} className={styles.breathe} />
      </span>
      <span className="absolute left-10 top-10">
        <span className={`block ${styles.float}`}>
          <Coin />
        </span>
      </span>
      <span className="absolute right-10 top-12">
        <span className={`block ${styles.float} ${styles.delay05}`}>
          <Coin />
        </span>
      </span>
      <span className="absolute bottom-10 left-1/2 -translate-x-1/2">
        <span className={`block ${styles.float} ${styles.delay1}`}>
          <Coin />
        </span>
      </span>
    </div>
  );
}

function GrowthScene() {
  return (
    <div className="flex h-64 w-full max-w-sm flex-col items-center justify-center gap-5">
      <span className={styles.pulseOpacity}>
        <Logo size={64} />
      </span>
      <div className="relative">
        <div className="flex h-24 items-end gap-2.5">
          <div
            className={`bg-primary w-6 rounded-t-md ${styles.bar}`}
            style={{ height: "40%" }}
          />
          <div
            className={`w-6 rounded-t-md ${styles.bar} ${styles.delay05}`}
            style={{ height: "70%", background: "#2fa05f" }}
          />
          <div
            className={`bg-primary w-6 rounded-t-md ${styles.bar} ${styles.delay1}`}
            style={{ height: "100%" }}
          />
        </div>
        <svg
          width="120"
          height="70"
          viewBox="0 0 120 70"
          className="absolute -top-14 -left-1.5"
          aria-hidden="true"
        >
          <polyline
            className={styles.trend}
            points="6,60 40,40 74,46 112,10"
            fill="none"
            stroke="#15803d"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <polyline
            className={styles.trend}
            points="112,10 98,12 110,26"
            fill="none"
            stroke="#15803d"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}

function RingScene() {
  return (
    <div className="relative flex h-64 w-full max-w-sm items-center justify-center">
      <div className="relative flex size-40 items-center justify-center">
        <svg
          viewBox="0 0 50 50"
          className={`absolute inset-0 size-40 ${styles.spin}`}
          aria-hidden="true"
        >
          <circle cx="25" cy="25" r="22" fill="none" stroke="#d1d5db" strokeWidth="4" />
          <circle
            cx="25"
            cy="25"
            r="22"
            fill="none"
            stroke="#1b7a43"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray="80 200"
          />
        </svg>
        <span className={styles.pulseOpacity}>
          <Logo size={80} />
        </span>
      </div>
      <span className={`text-primary absolute bottom-6 left-[30%] text-xl font-extrabold ${styles.rise}`}>
        $
      </span>
      <span
        className={`text-primary absolute bottom-4 left-[60%] text-xl font-extrabold ${styles.rise} ${styles.delay1}`}
      >
        $
      </span>
    </div>
  );
}

/**
 * Loader de marca. Sorteia um dos três conceitos a cada montagem (ou seja, a
 * cada transição), revezando-os entre as telas. Anuncia "Carregando…" para
 * leitores de tela. Por decisão de produto, a animação roda mesmo com
 * "reduzir movimento" ativo no sistema (é um estado breve de carregamento).
 */
export function GavetaLoader() {
  const [variant] = useState<Variant>(pickVariant);

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[60vh] flex-col items-center justify-center gap-4"
    >
      <span className="sr-only">Carregando…</span>
      {variant === "pulse" ? (
        <PulseScene />
      ) : variant === "growth" ? (
        <GrowthScene />
      ) : (
        <RingScene />
      )}
      <p
        aria-hidden="true"
        className={`text-muted-foreground text-base font-semibold ${styles.dots}`}
      >
        Carregando<span>.</span>
        <span>.</span>
        <span>.</span>
      </p>
    </div>
  );
}
