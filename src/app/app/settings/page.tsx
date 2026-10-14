import { AppShell } from "@/components/app-shell";
import { PlanQuotaView } from "@/components/monetization/plan-quota-view";
import { StartReminderPrefsPanel } from "@/components/start-reminder-prefs-panel";
import { createClient } from "@/lib/supabase/server";
import { isSchemaMissingError } from "@/lib/errors";
import { t } from "@/lib/i18n";
import {
  getActiveSpaceId,
  getLocale,
  getSession,
  getSpacesForUser,
} from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const locale = await getLocale();
  const { user, configured } = await getSession();
  if (!configured || !user) return null;

  const spaces = await getSpacesForUser(user.id);
  const activeSpaceId = await getActiveSpaceId(spaces);
  // Free/Pro space limit counts owned spaces only (022); invited memberships do not count.
  const spacesUsed = spaces.filter((s) => s.role === "owner" && !s.archived_at).length;

  let membersUsed = 0;
  let prefsOn = true;
  let prefsMinutes: 15 | 60 | 1440 = 60;
  let prefsSchemaOk = true;

  const supabase = await createClient();
  if (activeSpaceId) {
    const { count } = await supabase
      .from("space_members")
      .select("user_id", { count: "exact", head: true })
      .eq("space_id", activeSpaceId);
    membersUsed = count ?? 0;
  }

  {
    const { data, error } = await supabase
      .from("user_notification_preferences")
      .select("mission_start_reminder,mission_start_reminder_minutes")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error && isSchemaMissingError(error)) {
      prefsSchemaOk = false;
    } else if (data) {
      prefsOn = data.mission_start_reminder !== false;
      const m = data.mission_start_reminder_minutes;
      if (m === 15 || m === 60 || m === 1440) prefsMinutes = m;
    }
  }

  // Also hide if missions.start columns missing
  {
    const { error } = await supabase
      .from("missions")
      .select("start_reminder_minutes")
      .limit(1);
    if (error && isSchemaMissingError(error)) {
      prefsSchemaOk = false;
    }
  }

  return (
    <AppShell
      locale={locale}
      spaces={spaces}
      activeSpaceId={activeSpaceId}
      email={user.email}
      nav="settings"
    >
      <div className="mb-4">
        <h1 className="text-xl font-bold text-slate-900">
          {t(locale, "monPlanQuotaTitle")}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {t(locale, "monAssumedPriceNote")}
        </p>
      </div>
      <PlanQuotaView
        locale={locale}
        spacesUsed={spacesUsed}
        membersUsed={membersUsed}
      />
      <StartReminderPrefsPanel
        locale={locale}
        enabled={prefsSchemaOk}
        prefsEnabled={prefsOn}
        prefsMinutes={prefsMinutes}
      />
    </AppShell>
  );
}
