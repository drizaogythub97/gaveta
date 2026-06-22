import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="bg-muted/40 flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <Link
          href="/"
          aria-label="Gaveta — página inicial"
          className="text-foreground mb-6 block text-center text-2xl font-semibold tracking-tight"
        >
          Gaveta
        </Link>
        {children}
      </div>
    </main>
  );
}
