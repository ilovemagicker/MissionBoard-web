"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ACTIVE_SPACE_COOKIE } from "@/lib/session";
import { LOCALE_COOKIE, parseLocale } from "@/lib/i18n";

export async function setLocaleAction(locale: string) {
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, parseLocale(locale), {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}

export async function setActiveSpaceAction(spaceId: string) {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_SPACE_COOKIE, spaceId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/app", "layout");
}
