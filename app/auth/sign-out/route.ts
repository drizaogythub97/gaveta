import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { THEME_COOKIE } from "@/lib/theme/cookie";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const response = NextResponse.redirect(new URL("/login", request.url), {
    status: 303,
  });
  // O tema é da conta: sem sessão o cache local não vale mais. Deixá-lo para
  // trás faria a próxima conta a entrar neste aparelho herdar o tema alheio.
  response.cookies.delete(THEME_COOKIE);
  return response;
}
