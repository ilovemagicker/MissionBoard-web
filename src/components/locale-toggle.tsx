"use client";

import { setLocaleAction } from "@/app/actions/prefs";
import type { Locale } from "@/lib/types";

export function LocaleToggle({ locale }: { locale: Locale }) {
  return (
    <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs font-semibold">
      <button
        type="button"
        onClick={() => setLocaleAction("zh-Hant")}
        className={`rounded-md px-2 py-1 ${
          locale === "zh-Hant" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
        }`}
      >
        繁中
      </button>
      <button
        type="button"
        onClick={() => setLocaleAction("en")}
        className={`rounded-md px-2 py-1 ${
          locale === "en" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
        }`}
      >
        EN
      </button>
    </div>
  );
}
