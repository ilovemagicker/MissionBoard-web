import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { CalendarClient } from "@/components/calendar-client";
import { createClient } from "@/lib/supabase/server";
import { t } from "@/lib/i18n";
import {
  getActiveSpaceId,
  getLocale,
  getSession,
  getSpacesForUser,
} from "@/lib/session";
import type { MissionRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const locale = await getLocale();
  const { user, configured } = await getSession();
  if (!configured || !user) return null;

  const spaces = await getSpacesForUser(user.id);
  const activeSpaceId = await getActiveSpaceId(spaces);
  const supabase = await createClient();

  let missions: MissionRow[] = [];

  if (activeSpaceId) {
    const { data, error } = await supabase
      .from("missions")
      .select(
        "id,space_id,title,description,start_date,due_date,status,flag_icon,creator_id,created_at,updated_at,archived_at"
      )
      .eq("space_id", activeSpaceId)
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(300);

    if (error) {
      return (
        <AppShell
          locale={locale}
          spaces={spaces}
          activeSpaceId={activeSpaceId}
          email={user.email}
          nav="calendar"
        >
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {error.message}
          </p>
        </AppShell>
      );
    }
    missions = (data as MissionRow[]) ?? [];
  }

  return (
    <AppShell
      locale={locale}
      spaces={spaces}
      activeSpaceId={activeSpaceId}
      email={user.email}
      nav="calendar"
    >
      {!activeSpaceId ? (
        <div className="rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200/80">
          <p className="text-sm text-slate-600">{t(locale, "noSpaces")}</p>
          <Link
            href="/app/spaces"
            className="mt-4 inline-flex h-10 items-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white"
          >
            {t(locale, "spaces")}
          </Link>
        </div>
      ) : (
        <CalendarClient missions={missions} locale={locale} />
      )}
    </AppShell>
  );
}
