"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteMissionRecurrenceAction,
  saveMissionRecurrenceAction,
  setMissionRecurrenceActiveAction,
} from "@/app/actions/missions";
import { formatDateTime } from "@/lib/format";
import { t, tf } from "@/lib/i18n";
import type {
  Locale,
  MissionRecurrenceRow,
  RecurrenceFrequency,
} from "@/lib/types";

const WEEKDAY_KEYS = [
  { iso: 1, key: "weekdayShortMon" as const },
  { iso: 2, key: "weekdayShortTue" as const },
  { iso: 3, key: "weekdayShortWed" as const },
  { iso: 4, key: "weekdayShortThu" as const },
  { iso: 5, key: "weekdayShortFri" as const },
  { iso: 6, key: "weekdayShortSat" as const },
  { iso: 7, key: "weekdayShortSun" as const },
];

function minutesToTime(m: number): string {
  const hh = String(Math.floor(m / 60) % 24).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function summary(
  locale: Locale,
  rec: MissionRecurrenceRow
): string {
  const time = minutesToTime(rec.time_minutes);
  if (rec.frequency === "daily") {
    return `${t(locale, "recurrenceDaily")} ${time}`;
  }
  if (rec.frequency === "weekly") {
    const names = [...rec.weekdays]
      .sort()
      .map((iso) => {
        const w = WEEKDAY_KEYS.find((x) => x.iso === iso);
        return w ? t(locale, w.key) : String(iso);
      })
      .join(locale === "en" ? ", " : "、");
    return `${tf(locale, "recurrenceWeeklySummary", { days: names })} ${time}`;
  }
  if (rec.frequency === "monthly") {
    return `${tf(locale, "recurrenceMonthlySummary", {
      n: rec.month_day ?? 1,
    })} ${time}`;
  }
  return `${tf(locale, "recurrenceIntervalSummary", {
    n: rec.interval_days ?? 2,
  })} ${time}`;
}

export function MissionRecurrencePanel({
  locale,
  missionId,
  startDate,
  recurrence,
  isTemplate,
  canEdit,
  isArchived,
}: {
  locale: Locale;
  missionId: string;
  startDate: string | null;
  recurrence: MissionRecurrenceRow | null;
  /** True when this mission is the recurrence template (or no recurrence yet). */
  isTemplate: boolean;
  canEdit: boolean;
  isArchived: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(!recurrence);
  const [frequency, setFrequency] = useState<RecurrenceFrequency>(
    recurrence?.frequency ?? "daily"
  );
  const defaultWeekday = useMemo(() => {
    const d = new Date().getDay();
    return d === 0 ? 7 : d;
  }, []);
  const [weekdays, setWeekdays] = useState<number[]>(
    recurrence?.weekdays?.length ? recurrence.weekdays : [defaultWeekday]
  );
  const [endMode, setEndMode] = useState<"never" | "onDate" | "afterCount">(
    recurrence?.end_on
      ? "onDate"
      : recurrence?.max_count
        ? "afterCount"
        : "never"
  );

  function run(fn: () => Promise<{ error?: string; ok?: boolean } | void>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res && "error" in res && res.error) setError(res.error);
      else {
        setEditing(false);
        router.refresh();
      }
    });
  }

  function toggleWeekday(iso: number) {
    setWeekdays((prev) =>
      prev.includes(iso) ? prev.filter((x) => x !== iso) : [...prev, iso].sort()
    );
  }

  function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("recurrence_frequency", frequency);
    fd.set("recurrence_weekdays", weekdays.join(","));
    fd.set("recurrence_end_mode", endMode);
    fd.set(
      "recurrence_timezone",
      recurrence?.timezone ||
        Intl.DateTimeFormat().resolvedOptions().timeZone ||
        "Asia/Hong_Kong"
    );
    if (startDate) fd.set("recurrence_start_on", startDate);
    run(() => saveMissionRecurrenceAction(missionId, fd));
  }

  if (!isTemplate && recurrence) {
    return (
      <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200/80">
        <h2 className="mb-2 text-sm font-semibold tracking-wide text-slate-500">
          {t(locale, "recurrenceTitle")}
        </h2>
        <p className="text-sm text-slate-600">
          ↻ {t(locale, "recurrenceInstanceHint")}
        </p>
        <p className="mt-1 text-xs text-slate-500">{summary(locale, recurrence)}</p>
      </section>
    );
  }

  return (
    <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200/80">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-wide text-slate-500">
          {t(locale, "recurrenceTitle")}
        </h2>
        {recurrence && canEdit && !isArchived && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700"
          >
            {t(locale, "recurrenceManage")}
          </button>
        )}
      </div>

      {error && (
        <p className="mb-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {recurrence && !editing && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-800">
            ↻ {summary(locale, recurrence)}
            {!recurrence.active && (
              <span className="ml-2 text-amber-700">
                ({t(locale, "recurrenceStopped")})
              </span>
            )}
          </p>
          {recurrence.active && recurrence.next_run_at && (
            <p className="text-xs text-slate-500">
              {t(locale, "recurrenceNextRun")}:{" "}
              {formatDateTime(recurrence.next_run_at, locale)}
            </p>
          )}
          {!recurrence.active && (
            <p className="text-xs text-amber-700">{t(locale, "recurrenceStopped")}</p>
          )}
          <p className="text-xs text-slate-500">
            {t(locale, "recurrenceGeneratedCount")}: {recurrence.generated_count}
          </p>
          {canEdit && !isArchived && (
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(() =>
                    setMissionRecurrenceActiveAction(
                      recurrence.id,
                      missionId,
                      !recurrence.active
                    )
                  )
                }
                className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700"
              >
                {recurrence.active
                  ? t(locale, "recurrenceStop")
                  : t(locale, "recurrenceResume")}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (!window.confirm(t(locale, "recurrenceRemoveConfirm")))
                    return;
                  run(() =>
                    deleteMissionRecurrenceAction(recurrence.id, missionId)
                  );
                }}
                className="rounded-xl bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700"
              >
                {t(locale, "recurrenceRemove")}
              </button>
            </div>
          )}
        </div>
      )}

      {(!recurrence || editing) && canEdit && !isArchived && (
        <form onSubmit={onSave} className="space-y-3">
          {!recurrence && (
            <p className="text-[11px] text-slate-500">
              {t(locale, "recurrenceCreateHint")}
            </p>
          )}
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">
              {t(locale, "recurrenceFrequency")}
            </span>
            <select
              value={frequency}
              onChange={(e) =>
                setFrequency(e.target.value as RecurrenceFrequency)
              }
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
            >
              <option value="daily">{t(locale, "recurrenceDaily")}</option>
              <option value="weekly">{t(locale, "recurrenceWeekly")}</option>
              <option value="monthly">{t(locale, "recurrenceMonthly")}</option>
              <option value="interval">{t(locale, "recurrenceInterval")}</option>
            </select>
          </label>
          {frequency === "weekly" && (
            <div>
              <p className="mb-1 text-sm font-medium text-slate-700">
                {t(locale, "recurrenceWeekdays")}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAY_KEYS.map((w) => (
                  <button
                    key={w.iso}
                    type="button"
                    onClick={() => toggleWeekday(w.iso)}
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      weekdays.includes(w.iso)
                        ? "bg-blue-600 text-white"
                        : "bg-white text-slate-600 ring-1 ring-slate-200"
                    }`}
                  >
                    {t(locale, w.key)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {frequency === "monthly" && (
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">
                {t(locale, "recurrenceMonthDay")}
              </span>
              <input
                type="number"
                name="recurrence_month_day"
                min={1}
                max={31}
                defaultValue={recurrence?.month_day ?? new Date().getDate()}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
              />
            </label>
          )}
          {frequency === "interval" && (
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">
                {t(locale, "recurrenceIntervalDays")}
              </span>
              <input
                type="number"
                name="recurrence_interval_days"
                min={1}
                max={365}
                defaultValue={recurrence?.interval_days ?? 2}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
              />
            </label>
          )}
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">
              {t(locale, "recurrenceTime")}
            </span>
            <input
              type="time"
              name="recurrence_time"
              defaultValue={minutesToTime(recurrence?.time_minutes ?? 540)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
            />
          </label>
          <p className="text-[11px] text-slate-400">
            {t(locale, "recurrenceTimeHint")}
          </p>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">
              {t(locale, "recurrenceEnd")}
            </span>
            <select
              value={endMode}
              onChange={(e) =>
                setEndMode(e.target.value as typeof endMode)
              }
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
            >
              <option value="never">{t(locale, "recurrenceEndNever")}</option>
              <option value="onDate">{t(locale, "recurrenceEndOnDate")}</option>
              <option value="afterCount">
                {t(locale, "recurrenceEndAfterCount")}
              </option>
            </select>
          </label>
          {endMode === "onDate" && (
            <input
              type="date"
              name="recurrence_end_on"
              defaultValue={recurrence?.end_on ?? ""}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
            />
          )}
          {endMode === "afterCount" && (
            <input
              type="number"
              name="recurrence_max_count"
              min={1}
              max={1000}
              defaultValue={recurrence?.max_count ?? 10}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
            />
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={
                pending || (frequency === "weekly" && weekdays.length === 0)
              }
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {t(locale, "recurrenceSave")}
            </button>
            {recurrence && (
              <button
                type="button"
                disabled={pending}
                onClick={() => setEditing(false)}
                className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                {t(locale, "cancel")}
              </button>
            )}
          </div>
        </form>
      )}

      {!recurrence && !canEdit && (
        <p className="text-sm text-slate-500">{t(locale, "recurrenceNone")}</p>
      )}
    </section>
  );
}
