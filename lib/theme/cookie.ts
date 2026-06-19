import { cookies } from "next/headers";

export const THEME_COOKIE = "erp_theme";
export type Theme = "light" | "dark";

export async function getThemeFromCookie(): Promise<Theme> {
  const store = await cookies();
  const value = store.get(THEME_COOKIE)?.value;
  return value === "dark" ? "dark" : "light";
}
