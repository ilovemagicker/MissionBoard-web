"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";
import { createMissionAction } from "@/app/actions/missions";
import { FlagIconPicker, DEFAULT_FLAG_ICON } from "@/components/flag-icon";
import { t } from "@/lib/i18n";
import { deviceTimezone } from "@/lib/start-reminder";
import type { Locale, ProfileRow, RecurrenceFrequency } from "@/lib/types";

const WEEKDAY_KEYS = [
  { iso: 1, key: "weekdayShortMon" as const },
  { iso: 2, key: "weekdayShortTue" as const },
  { iso: 3, key: "weekdayShortWed" as const },
  { iso: 4, key: "weekdayShortThu" as const },
  { iso: 5, key: "weekdayShortFri" as const },
  { iso: 6, key: "weekdayShortSat" as const },
  { iso: 7, key: "weekdayShortSun" as const },
];

export function CreateMissionForm({
  locale,
  spaceId,
  members,
  profiles,
  startReminderEnabled = true,
}: {
  locale: Locale;
  spaceId: string;
  members: { user_id: string; role: string }[];
  profiles: Record<string, ProfileRow>;
  startReminderEnabled?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [repeat, setRepeat] = useState(false);
  const [frequency, setFrequency] = useState<RecurrenceFrequency>("daily");
  const defaultWeekday = useMemo(() => {
    const d = new Date().getDay();
    return d === 0 ? 7 : d;
  }, []);
  const [weekdays, setWeekdays] = useState<number[]>([defaultWeekday]);
  const [endMode, setEndMode] = useState<"never" | "onDate" | "afterCount">(
    "never"
  );
  const [flagIcon, setFlagIcon] = useState<string>(DEFAULT_FLAG_ICON);

  function toggleWeekday(iso: number) {
    setWeekdays((prev) =>
      prev.includes(iso) ? prev.filter((x) => x !== iso) : [...prev, iso].sort()
    );
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("space_id", spaceId);
    fd.set("recurrence_enabled", repeat ? "1" : "0");
    fd.set("start_timezone", deviceTimezone());
    if (repeat) {
      fd.set("recurrence_frequency", frequency);
      fd.set("recurrence_weekdays", weekdays.join(","));
      fd.set("recurrence_timezone", deviceTimezone());
    }
    setError(null);
    startTransition(async () => {
      const res = await createMissionAction(fd);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200/80"
    >
      {error && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">{t(locale, "title")}</span>
        <input
          name="title"
          required
          className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-500"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">
          {t(locale, "description")}
        </span>
        <textarea
          name="description"
          rows={4}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
      </label>
      <FlagIconPicker
        locale={locale}
        value={flagIcon}
        onChange={setFlagIcon}
        name="flag_icon"
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">
            {t(locale, "startDate")}
          </span>
          <input
            type="date"
            name="start_date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">
            {t(locale, "dueDate")}
          </span>
          <input
            type="date"
            name="due_date"
            className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
          />
        </label>
      </div>
      {startReminderEnabled && (
        <fieldset className="space-y-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200/80">
          <p className="text-sm font-semibold text-slate-800">
            {t(locale, "startReminderSection")}
          </p>
          <p className="text-[11px] text-slate-500">
            {t(locale, "startReminderPushNote")}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">
                {t(locale, "startTime")}
              </span>
              <input
                type="time"
                name="start_time"
                value={startTime}
                disabled={!startDate}
                onChange={(e) => setStartTime(e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm disabled:bg-slate-100"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">
                {t(locale, "startReminder")}
              </span>
              <select
                name="start_reminder_minutes"
                defaultValue="default"
                disabled={!startDate || !startTime}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm disabled:bg-slate-100"
              >
                <option value="default">{t(locale, "startReminderDefault")}</option>
                <option value="0">{t(locale, "startReminderOff")}</option>
                <option value="15">{t(locale, "startReminder15")}</option>
                <option value="60">{t(locale, "startReminder60")}</option>
                <option value="1440">{t(locale, "startReminder1440")}</option>
              </select>
            </label>
          </div>
          {!startDate && (
            <p className="text-[11px] text-slate-400">
              {t(locale, "startReminderNeedDate")}
            </p>
          )}
          {startDate && !startTime && (
            <p className="text-[11px] text-slate-400">
              {t(locale, "startReminderNeedTime")}
            </p>
          )}
        </fieldset>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">
            {t(locale, "priority")}
          </span>
          <select
            name="priority"
            defaultValue="medium"
            className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
          >
            <option value="high">{t(locale, "priorityHigh")}</option>
            <option value="medium">{t(locale, "priorityMedium")}</option>
            <option value="low">{t(locale, "priorityLow")}</option>
            <option value="none">{t(locale, "priorityNone")}</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">
            {t(locale, "decisionMaker")}
          </span>
          <select
            name="decision_maker_id"
            defaultValue=""
            className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
          >
            <option value="">{t(locale, "decisionMakerNone")}</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {profiles[m.user_id]?.display_name || m.user_id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-[11px] text-slate-400">{t(locale, "decisionMakerHint")}</p>

      <fieldset className="space-y-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200/80">
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <input
            type="checkbox"
            checked={repeat}
            onChange={(e) => setRepeat(e.target.checked)}
            className="h-4 w-4"
          />
          {t(locale, "recurrenceToggle")}
        </label>
        {repeat && (
          <>
            <p className="text-[11px] text-slate-500">
              {t(locale, "recurrenceCreateHint")}
            </p>
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
                  defaultValue={new Date().getDate()}
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
                  defaultValue={2}
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
                defaultValue="09:00"
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
                name="recurrence_end_mode"
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
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
              />
            )}
            {endMode === "afterCount" && (
              <input
                type="number"
                name="recurrence_max_count"
                min={1}
                max={1000}
                defaultValue={10}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
              />
            )}
          </>
        )}
      </fieldset>

      <button
        type="submit"
        disabled={pending || (repeat && frequency === "weekly" && weekdays.length === 0)}
        className="h-11 w-full rounded-xl bg-blue-600 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
      >
        {pending ? t(locale, "loading") : t(locale, "create")}
      </button>
    </form>
  );
}
