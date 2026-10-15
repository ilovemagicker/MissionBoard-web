"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { EntitlementsProvider } from "@/components/entitlements-provider";
import { HeaderPlanBadge } from "@/components/monetization/header-plan-badge";
import { OnboardingTour } from "@/components/onboarding-tour";
import { SpaceSwitcher } from "@/components/space-switcher";
import { UserMenu } from "@/components/user-menu";
import { t, type MessageKey } from "@/lib/i18n";
import type { Locale, SpaceWithRole } from "@/lib/types";

type NavId =
  | "missions"
  | "calendar"
  | "schedule"
  | "activity"
  | "spaces"
  | "settings";

const SIDEBAR_COLLAPSED_KEY = "mb_sidebar_collapsed";

function IconMissions({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconSchedule({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="3"
        y="5"
        width="18"
        height="16"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M3 10h18M8 3v4M16 3v4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconActivity({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 12h3l2.5-6 4 12L16 9h4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconSpaces({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconMe({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="2" />
      <path
        d="M5 19.5c1.5-3 4-4.5 7-4.5s5.5 1.5 7 4.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconMenu({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7h16M4 12h16M4 17h16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconCollapse({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M15 6l-6 6 6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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
  nav: NavId;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      if (stored === "1") setCollapsed(true);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setCollapsed((c) => {
          const next = !c;
          try {
            localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
          } catch {
            /* ignore */
          }
          return next;
        });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const primary: {
    id: NavId;
    href: string;
    key: MessageKey;
    icon: (p: { className?: string }) => React.ReactNode;
  }[] = [
    { id: "missions", href: "/app/missions", key: "missions", icon: IconMissions },
    { id: "schedule", href: "/app/schedule", key: "schedule", icon: IconSchedule },
    { id: "activity", href: "/app/activity", key: "activity", icon: IconActivity },
  ];

  const secondary: typeof primary = [
    {
      id: "spaces",
      href: "/app/spaces",
      key: "spacesSettings",
      icon: IconSpaces,
    },
    { id: "settings", href: "/app/settings", key: "meTitle", icon: IconMe },
  ];

  function isActive(id: NavId) {
    if (id === "missions") return nav === "missions" || nav === "calendar";
    return nav === id;
  }

  function navLink(
    item: (typeof primary)[number],
    opts: { collapsedView: boolean; onNavigate?: () => void }
  ) {
    const active = isActive(item.id);
    const Icon = item.icon;
    return (
      <Link
        key={item.id}
        href={item.href}
        title={t(locale, item.key)}
        onClick={opts.onNavigate}
        className={`group relative flex items-center gap-2.5 rounded-md text-sm font-medium transition-colors ${
          opts.collapsedView ? "justify-center px-2 py-2" : "px-3 py-2"
        } ${
          active
            ? "bg-brand/10 text-brand"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        }`}
      >
        {active && (
          <span
            className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-brand"
            aria-hidden
          />
        )}
        <Icon className="h-4 w-4 shrink-0" />
        {!opts.collapsedView && <span className="truncate">{t(locale, item.key)}</span>}
      </Link>
    );
  }

  const sidebarInner = (opts: {
    collapsedView: boolean;
    onNavigate?: () => void;
  }) => (
    <div className="flex h-full flex-col">
      <div
        className={`flex h-12 shrink-0 items-center border-b border-slate-200/80 ${
          opts.collapsedView ? "justify-center px-2" : "justify-between gap-2 px-3"
        }`}
      >
        {!opts.collapsedView && (
          <Link
            href="/app/missions"
            className="truncate text-sm font-semibold text-brand"
            onClick={opts.onNavigate}
          >
            {t(locale, "appName")}
          </Link>
        )}
        {!opts.onNavigate && (
          <button
            type="button"
            onClick={toggleCollapsed}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title="⌘B"
          >
            <IconCollapse
              className={`h-4 w-4 transition-transform ${collapsed ? "rotate-180" : ""}`}
            />
          </button>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 p-2">
        {primary.map((item) => navLink(item, opts))}
        <div className="my-2 border-t border-slate-200/80" />
        {secondary.map((item) => navLink(item, opts))}
      </nav>
    </div>
  );

  return (
    <EntitlementsProvider>
      <OnboardingTour locale={locale} />
      <div className="flex min-h-screen bg-[var(--background)]">
        {/* Desktop sidebar */}
        <aside
          className={`sticky top-0 hidden h-screen shrink-0 border-r border-slate-200/80 bg-white lg:flex lg:flex-col ${
            collapsed ? "w-16" : "w-60"
          }`}
        >
          {sidebarInner({ collapsedView: collapsed })}
        </aside>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-slate-900/40"
              aria-label="Close menu"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="absolute left-0 top-0 flex h-full w-60 flex-col bg-white shadow-xl">
              {sidebarInner({
                collapsedView: false,
                onNavigate: () => setMobileOpen(false),
              })}
            </aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-3 border-b border-slate-200/80 bg-white px-3 sm:px-5">
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <IconMenu className="h-5 w-5" />
            </button>

            <Link
              href="/app/missions"
              className="truncate text-sm font-semibold text-brand lg:hidden"
            >
              {t(locale, "appName")}
            </Link>
            {collapsed && (
              <Link
                href="/app/missions"
                className="hidden truncate text-sm font-semibold text-brand lg:inline"
              >
                {t(locale, "appName")}
              </Link>
            )}

            <div className="hidden items-center gap-2 sm:flex">
              <HeaderPlanBadge locale={locale} />
            </div>

            <div className="ml-auto flex min-w-0 items-center gap-2">
              <SpaceSwitcher
                spaces={spaces}
                activeSpaceId={activeSpaceId}
                label={t(locale, "activeSpace")}
              />
              <div className="sm:hidden">
                <HeaderPlanBadge locale={locale} />
              </div>
              <UserMenu locale={locale} email={email} />
            </div>
          </header>

          <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
            {children}
          </main>
        </div>
      </div>
    </EntitlementsProvider>
  );
}
