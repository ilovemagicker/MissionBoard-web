"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config";
import { formatError, isSchemaMissingError } from "@/lib/errors";
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

export async function updateMissionStartReminderPrefsAction(input: {
  enabled: boolean;
  minutes: 15 | 60 | 1440;
}) {
  try {
    if (!isSupabaseConfigured()) throw new Error("Supabase not configured");
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const minutes =
      input.minutes === 15 || input.minutes === 60 || input.minutes === 1440
        ? input.minutes
        : 60;

    const row = {
      user_id: user.id,
      mission_start_reminder: !!input.enabled,
      mission_start_reminder_minutes: minutes,
    };

    const { error } = await supabase
      .from("user_notification_preferences")
      .upsert(row, { onConflict: "user_id" });
    if (error) {
      if (isSchemaMissingError(error)) {
        return {
          error:
            "Notification preferences unavailable (migration 030 not applied)",
        };
      }
      throw error;
    }
    revalidatePath("/app/settings");
    return { ok: true as const };
  } catch (err) {
    return { error: formatError(err) };
  }
}
