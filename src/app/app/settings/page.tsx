import { AppShell } from "@/components/app-shell";
import { PlanQuotaView } from "@/components/monetization/plan-quota-view";
import { createClient } from "@/lib/supabase/server";
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
  const spacesUsed = spaces.length;

  let membersUsed = 0;
  if (activeSpaceId) {
    const supabase = await createClient();
    const { count } = await supabase
      .from("space_members")
      .select("user_id", { count: "exact", head: true })
      .eq("space_id", activeSpaceId);
    membersUsed = count ?? 0;
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
    </AppShell>
  );
}
