"use client";

import { useEffect, useRef, useState } from "react";
import { LocaleToggle } from "@/components/locale-toggle";
import { LogoutButton } from "@/components/logout-button";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

export function UserMenu({
  locale,
  email,
}: {
  locale: Locale;
  email?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initial = (email?.trim()?.[0] ?? "?").toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 text-xs font-semibold text-slate-700 ring-1 ring-slate-200/80 hover:bg-slate-200"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={email ?? t(locale, "meTitle")}
      >
        {initial}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1.5 w-56 rounded-lg border border-slate-200 bg-white p-2 shadow-lg"
        >
          {email && (
            <p className="truncate px-2 py-1.5 text-xs text-slate-500">{email}</p>
          )}
          <div className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50">
            <span className="text-xs font-medium text-slate-600">
              {t(locale, "language")}
            </span>
            <LocaleToggle locale={locale} />
          </div>
          <div className="mt-1 border-t border-slate-100 pt-1">
            <LogoutButton label={t(locale, "logout")} />
          </div>
        </div>
      )}
    </div>
  );
}
