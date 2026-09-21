import { redirect } from "next/navigation";
import {
  getActiveSpaceId,
  getLocale,
  getSession,
  getSpacesForUser,
} from "@/lib/session";
import { t } from "@/lib/i18n";
import { isSupabaseConfigured } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isSupabaseConfigured()) {
    return (
      <main className="mx-auto max-w-lg px-6 py-16">
        <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200/80">
          <h1 className="text-lg font-semibold text-slate-900">
            {t("zh-Hant", "envMissing")}
          </h1>
        </div>
      </main>
    );
  }

  const { user } = await getSession();
  if (!user) {
    redirect("/login");
  }

  // Prefetch for nested pages via React cache would be nicer; children fetch again.
  // Layout only gates auth; shell is per-page so nav highlight works.
  void getLocale();
  void getSpacesForUser(user.id).then((spaces) => getActiveSpaceId(spaces));

  return <>{children}</>;
}
