import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { CreateMissionForm } from "@/components/create-mission-form";
import { t } from "@/lib/i18n";
import {
  getActiveSpaceId,
  getLocale,
  getSession,
  getSpacesForUser,
} from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function NewMissionPage() {
  const locale = await getLocale();
  const { user, configured } = await getSession();
  if (!configured || !user) return null;

  const spaces = await getSpacesForUser(user.id);
  const activeSpaceId = await getActiveSpaceId(spaces);

  return (
    <AppShell
      locale={locale}
      spaces={spaces}
      activeSpaceId={activeSpaceId}
      email={user.email}
      nav="missions"
    >
      <div className="mb-4">
        <Link href="/app/missions" className="text-sm font-medium text-blue-600">
          ← {t(locale, "back")}
        </Link>
        <h1 className="mt-2 text-xl font-bold text-slate-900">
          {t(locale, "createMission")}
        </h1>
      </div>
      {!activeSpaceId ? (
        <p className="text-sm text-slate-500">{t(locale, "noSpaces")}</p>
      ) : (
        <CreateMissionForm locale={locale} spaceId={activeSpaceId} />
      )}
    </AppShell>
  );
}
