import Link from "next/link";
import { EntitlementsProvider } from "@/components/entitlements-provider";
import { HeaderPlanBadge } from "@/components/monetization/header-plan-badge";
import { LocaleToggle } from "@/components/locale-toggle";
import { LogoutButton } from "@/components/logout-button";
import { SpaceSwitcher } from "@/components/space-switcher";
import { t, type MessageKey } from "@/lib/i18n";
import type { Locale, SpaceWithRole } from "@/lib/types";

export function AppShell({
  children,
  locale,
  spaces,
  activeSpaceId,
  email,
  nav,
}: {
  children: React.ReactNode;
  locale: Locale;
  spaces: SpaceWithRole[];
  activeSpaceId: string | null;
  email?: string | null;
  nav: "missions" | "calendar" | "schedule" | "activity" | "spaces" | "settings";
}) {
  const link = (href: string, key: MessageKey, active: boolean) => (
    <Link
      href={href}
      className={`rounded-xl px-3 py-2 text-sm font-semibold ${
        active
          ? "bg-blue-600 text-white"
          : "text-slate-700 hover:bg-slate-100"
      }`}
    >
      {t(locale, key)}
    </Link>
  );

  return (
    <EntitlementsProvider>
      <div className="mx-auto min-h-screen max-w-5xl px-4 py-6 sm:px-6">
        <header className="mb-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Link href="/" className="text-sm font-semibold text-blue-600">
                  {t(locale, "appName")}
                </Link>
                <HeaderPlanBadge locale={locale} />
              </div>
              {email && <p className="mt-0.5 text-xs text-slate-500">{email}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/app/settings"
                className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${
                  nav === "settings"
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {t(locale, "monPlanAndQuota")}
              </Link>
              <LocaleToggle locale={locale} />
              <LogoutButton label={t(locale, "logout")} />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <nav className="flex flex-wrap gap-1 rounded-2xl bg-white p-1 shadow-sm ring-1 ring-slate-200/80">
              {link("/app/missions", "missions", nav === "missions")}
              {link("/app/calendar", "calendar", nav === "calendar")}
              {link("/app/schedule", "schedule", nav === "schedule")}
              {link("/app/activity", "activity", nav === "activity")}
              {link("/app/spaces", "spaces", nav === "spaces")}
            </nav>
            <SpaceSwitcher
              spaces={spaces}
              activeSpaceId={activeSpaceId}
              label={t(locale, "activeSpace")}
            />
          </div>
        </header>
        {children}
      </div>
    </EntitlementsProvider>
  );
}
