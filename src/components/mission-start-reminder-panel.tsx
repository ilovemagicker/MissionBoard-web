"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateMissionStartScheduleAction } from "@/app/actions/missions";
import { t, tf } from "@/lib/i18n";
import {
  deviceTimezone,
  estimateReminderLocalLabel,
  minutesToTimeInput,
  parseStartReminderMinutes,
  parseStartTimeMinutes,
} from "@/lib/start-reminder";
import type { Locale, MissionRow } from "@/lib/types";

export function MissionStartReminderPanel({
  locale,
  mission,
  enabled,
  canEdit,
  isArchived,
}: {
  locale: Locale;
  mission: MissionRow;
  enabled: boolean;
  canEdit: boolean;
  isArchived: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(mission.start_date ?? "");
  const [startTime, setStartTime] = useState(
    mission.start_time_minutes != null
      ? minutesToTimeInput(mission.start_time_minutes)
      : ""
  );
  const [reminder, setReminder] = useState(
    mission.start_reminder_minutes == null
      ? "default"
      : String(mission.start_reminder_minutes)
  );

  const estimate = useMemo(() => {
    const mins = parseStartTimeMinutes(startTime);
    const rem = parseStartReminderMinutes(reminder);
    return estimateReminderLocalLabel(startDate || null, mins, rem);
  }, [startDate, startTime, reminder]);

  if (!enabled) return null;

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await updateMissionStartScheduleAction(mission.id, {
        startDate: startDate || null,
        startTimeMinutes: parseStartTimeMinutes(startTime),
        startTimezone: deviceTimezone(),
        startReminderMinutes: parseStartReminderMinutes(reminder),
      });
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  const displayTz = mission.start_timezone || deviceTimezone();

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="mb-1 text-sm font-semibold tracking-wide text-slate-500">
        {t(locale, "startReminderSection")}
      </h2>
      <p className="mb-4 text-[11px] text-slate-400">
        {t(locale, "startReminderPushNote")}
      </p>
      {error && (
        <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">
            {t(locale, "startDate")}
          </span>
          <input
            type="date"
            value={startDate}
            disabled={pending || !canEdit || isArchived}
            onChange={(e) => setStartDate(e.target.value)}
            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">
            {t(locale, "startTime")}
          </span>
          <input
            type="time"
            value={startTime}
            disabled={pending || !canEdit || isArchived || !startDate}
            onChange={(e) => setStartTime(e.target.value)}
            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm disabled:bg-slate-50"
          />
        </label>
      </div>
      <label className="mt-3 block text-sm">
        <span className="mb-1 block font-medium text-slate-700">
          {t(locale, "startReminder")}
        </span>
        <select
          value={reminder}
          disabled={pending || !canEdit || isArchived || !startDate || !startTime}
          onChange={(e) => setReminder(e.target.value)}
          className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm disabled:bg-slate-50"
        >
          <option value="default">{t(locale, "startReminderDefault")}</option>
          <option value="0">{t(locale, "startReminderOff")}</option>
          <option value="15">{t(locale, "startReminder15")}</option>
          <option value="60">{t(locale, "startReminder60")}</option>
          <option value="1440">{t(locale, "startReminder1440")}</option>
        </select>
      </label>
      <div className="mt-3 space-y-1 text-[11px] text-slate-500">
        {startDate && startTime ? (
          <p>
            {t(locale, "startTimezone")}: {displayTz}
          </p>
        ) : (
          <p>{t(locale, "startReminderNeedTime")}</p>
        )}
        {estimate && (
          <p>
            {tf(locale, "startReminderEstimate", { when: estimate })}
          </p>
        )}
        {reminder === "default" && startDate && startTime && (
          <p>{t(locale, "startReminderDefaultHint")}</p>
        )}
        {reminder === "0" && startDate && startTime && (
          <p>{t(locale, "startReminderOffHint")}</p>
        )}
      </div>
      {canEdit && !isArchived && (
        <button
          type="button"
          disabled={pending}
          onClick={save}
          className="mt-4 h-10 rounded-xl bg-brand px-4 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
        >
          {pending ? t(locale, "loading") : t(locale, "save")}
        </button>
      )}
    </section>
  );
}
