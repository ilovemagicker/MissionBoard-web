"use client";

import { setLocaleAction } from "@/app/actions/prefs";
import { LOCALE_LABELS, SUPPORTED_LOCALES } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

export function LocaleToggle({ locale }: { locale: Locale }) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600">
      <span className="sr-only">{LOCALE_LABELS[locale]}</span>
      <select
        value={locale}
        onChange={(e) => setLocaleAction(e.target.value)}
        className="rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-800 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        aria-label="Language"
      >
        {SUPPORTED_LOCALES.map((code) => (
          <option key={code} value={code}>
            {LOCALE_LABELS[code]}
          </option>
        ))}
      </select>
    </label>
  );
}
