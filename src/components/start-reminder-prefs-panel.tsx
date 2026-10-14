"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateMissionStartReminderPrefsAction } from "@/app/actions/prefs";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

export function StartReminderPrefsPanel({
  locale,
  enabled,
  prefsEnabled,
  prefsMinutes,
}: {
  locale: Locale;
  enabled: boolean;
  prefsEnabled: boolean;
  prefsMinutes: 15 | 60 | 1440;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [on, setOn] = useState(prefsEnabled);
  const [minutes, setMinutes] = useState<15 | 60 | 1440>(prefsMinutes);

  if (!enabled) return null;

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await updateMissionStartReminderPrefsAction({
        enabled: on,
        minutes,
      });
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <section className="mt-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200/80">
      <h2 className="text-sm font-semibold tracking-wide text-slate-500">
        {t(locale, "notifPrefsSection")}
      </h2>
      <p className="mt-1 text-[11px] text-slate-400">
        {t(locale, "startReminderPushNote")}
      </p>
      {error && (
        <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <label className="mt-4 flex items-center gap-2 text-sm font-medium text-slate-800">
        <input
          type="checkbox"
          checked={on}
          disabled={pending}
          onChange={(e) => setOn(e.target.checked)}
          className="h-4 w-4"
        />
        {t(locale, "notifMissionStartReminder")}
      </label>
      <label className="mt-3 block text-sm">
        <span className="mb-1 block font-medium text-slate-700">
          {t(locale, "notifMissionStartReminderDefault")}
        </span>
        <select
          value={minutes}
          disabled={pending || !on}
          onChange={(e) =>
            setMinutes(Number(e.target.value) as 15 | 60 | 1440)
          }
          className="h-10 w-full max-w-xs rounded-xl border border-slate-200 bg-white px-3 text-sm disabled:bg-slate-50"
        >
          <option value={15}>{t(locale, "startReminder15")}</option>
          <option value={60}>{t(locale, "startReminder60")}</option>
          <option value={1440}>{t(locale, "startReminder1440")}</option>
        </select>
      </label>
      <p className="mt-2 text-[11px] text-slate-400">
        {t(locale, "notifMissionStartReminderHint")}
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={save}
        className="mt-4 h-10 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
      >
        {pending ? t(locale, "loading") : t(locale, "save")}
      </button>
    </section>
  );
}
