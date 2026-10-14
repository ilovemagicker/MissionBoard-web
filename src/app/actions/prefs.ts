"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config";
import { formatError, isSchemaMissingError } from "@/lib/errors";
import { ACTIVE_SPACE_COOKIE } from "@/lib/session";
import { LOCALE_COOKIE, parseLocale } from "@/lib/i18n";
import type { Locale, ShiftReminderMinutes } from "@/lib/types";

export async function setLocaleAction(locale: string) {
  const cookieStore = await cookies();
  const parsed = parseLocale(locale);
  cookieStore.set(LOCALE_COOKIE, parsed, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  // Best-effort: sync push locale for mobile (035). Ignore if column/RPC missing.
  try {
    if (isSupabaseConfigured()) {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("user_notification_preferences").upsert(
          {
            user_id: user.id,
            locale: webLocaleToPushLocale(parsed),
          },
          { onConflict: "user_id" }
        );
      }
    }
  } catch {
    // ignore
  }
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

function webLocaleToPushLocale(locale: Locale): string {
  return locale === "en" ? "en" : "zh";
}

const SHIFT_MINUTES: ShiftReminderMinutes[] = [
  15, 30, 60, 120, 360, 720, 1440,
];

export type NotificationPrefsInput = {
  mission_due_today: boolean;
  mission_due_soon: boolean;
  step_claimed: boolean;
  step_completed: boolean;
  step_assigned_to_me: boolean;
  new_comment: boolean;
  mission_created: boolean;
  mission_status_changed: boolean;
  join_request_pending: boolean;
  join_request_resolved: boolean;
  member_joined: boolean;
  member_kicked: boolean;
  shift_reminder_enabled: boolean;
  shift_reminder_minutes: number;
  shift_swap_pending: boolean;
  step_claim_approval_pending: boolean;
  mission_start_reminder: boolean;
  mission_start_reminder_minutes: 15 | 60 | 1440;
  task_poll_announcement: boolean;
  space_announcement: boolean;
  step_deadline_reminder: boolean;
};

export async function updateNotificationPrefsAction(input: NotificationPrefsInput) {
  try {
    if (!isSupabaseConfigured()) throw new Error("Supabase not configured");
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const locale = parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);
    const startMinutes =
      input.mission_start_reminder_minutes === 15 ||
      input.mission_start_reminder_minutes === 60 ||
      input.mission_start_reminder_minutes === 1440
        ? input.mission_start_reminder_minutes
        : 60;
    const shiftMinutes = SHIFT_MINUTES.includes(
      input.shift_reminder_minutes as ShiftReminderMinutes
    )
      ? input.shift_reminder_minutes
      : 60;

    const row: Record<string, unknown> = {
      user_id: user.id,
      mission_due_today: !!input.mission_due_today,
      mission_due_soon: !!input.mission_due_soon,
      step_claimed: !!input.step_claimed,
      step_completed: !!input.step_completed,
      step_assigned_to_me: !!input.step_assigned_to_me,
      new_comment: !!input.new_comment,
      mission_created: !!input.mission_created,
      mission_status_changed: !!input.mission_status_changed,
      join_request_pending: !!input.join_request_pending,
      join_request_resolved: !!input.join_request_resolved,
      member_joined: !!input.member_joined,
      member_kicked: !!input.member_kicked,
      shift_reminder_enabled: !!input.shift_reminder_enabled,
      shift_reminder_minutes: shiftMinutes,
      shift_swap_pending: !!input.shift_swap_pending,
      step_claim_approval_pending: !!input.step_claim_approval_pending,
      mission_start_reminder: !!input.mission_start_reminder,
      mission_start_reminder_minutes: startMinutes,
      task_poll_announcement: !!input.task_poll_announcement,
      space_announcement: !!input.space_announcement,
      step_deadline_reminder: !!input.step_deadline_reminder,
      locale: webLocaleToPushLocale(locale),
    };

    const { error } = await supabase
      .from("user_notification_preferences")
      .upsert(row, { onConflict: "user_id" });
    if (error) {
      if (isSchemaMissingError(error)) {
        // Retry without newer optional columns (037 / 032 / 034 / 030).
        const core = { ...row };
        delete core.step_deadline_reminder;
        delete core.task_poll_announcement;
        delete core.space_announcement;
        delete core.mission_start_reminder;
        delete core.mission_start_reminder_minutes;
        const { error: err2 } = await supabase
          .from("user_notification_preferences")
          .upsert(core, { onConflict: "user_id" });
        if (err2) {
          if (isSchemaMissingError(err2)) {
            return {
              error:
                "Notification preferences unavailable (migrations not applied)",
            };
          }
          throw err2;
        }
      } else {
        throw error;
      }
    }
    revalidatePath("/app/settings");
    return { ok: true as const };
  } catch (err) {
    return { error: formatError(err) };
  }
}

/** @deprecated Prefer updateNotificationPrefsAction — kept for older callers. */
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

export async function updateProfileAction(input: {
  displayName: string;
  avatarUrl?: string | null;
}) {
  try {
    if (!isSupabaseConfigured()) throw new Error("Supabase not configured");
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const displayName = input.displayName.trim();
    if (!displayName) throw new Error("Display name required");
    if (displayName.length > 80) throw new Error("Display name too long");

    let avatarUrl = (input.avatarUrl ?? "").trim();
    if (avatarUrl === "") avatarUrl = "";
    if (avatarUrl && !/^https?:\/\//i.test(avatarUrl)) {
      throw new Error("Avatar URL must start with http(s)://");
    }
    if (avatarUrl.length > 500) throw new Error("Avatar URL too long");

    const row: Record<string, unknown> = {
      id: user.id,
      display_name: displayName,
      avatar_url: avatarUrl || null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("profiles").upsert(row, {
      onConflict: "id",
    });
    if (error) throw error;
    revalidatePath("/app/settings");
    revalidatePath("/app", "layout");
    return { ok: true as const };
  } catch (err) {
    return { error: formatError(err) };
  }
}
