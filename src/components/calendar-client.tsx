"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  addMonths,
  appearanceBadgeClass,
  appearanceDotClass,
  daysInMonth,
  dominantAppearance,
  entriesForDay,
  mondayFirstWeekday,
  startOfMonth,
  toDateKey,
  type CalendarAppearance,
} from "@/lib/calendar";
import { statusLabel, t } from "@/lib/i18n";
import type { Locale, MissionRow } from "@/lib/types";

const WEEKDAYS_ZH = ["一", "二", "三", "四", "五", "六", "日"];
const WEEKDAYS_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function appearanceLabel(locale: Locale, a: CalendarAppearance): string {
  if (a === "deadlineDay") return t(locale, "legendDeadlineDay");
  if (a === "overdue") return t(locale, "overdue");
  return statusLabel(locale, a);
}

export function CalendarClient({
  missions,
  locale,
}: {
  missions: MissionRow[];
  locale: Locale;
}) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [selectedKey, setSelectedKey] = useState(() => toDateKey(new Date()));

  const selectedDate = useMemo(() => {
    const [y, m, d] = selectedKey.split("-").map(Number);
    return new Date(y, m - 1, d);
  }, [selectedKey]);

  const monthLabel = useMemo(() => {
    return cursor.toLocaleDateString(locale === "en" ? "en-US" : "zh-HK", {
      year: "numeric",
      month: "long",
    });
  }, [cursor, locale]);

  const cells = useMemo(() => {
    const first = startOfMonth(cursor);
    const lead = mondayFirstWeekday(first);
    const total = daysInMonth(cursor);
    const todayKey = toDateKey(new Date());
    const items: {
      key: string;
      day: number;
      inMonth: boolean;
      date: Date;
      appearances: CalendarAppearance[];
      dominant: CalendarAppearance | null;
      isToday: boolean;
    }[] = [];

    for (let i = 0; i < lead; i++) {
      const date = new Date(cursor.getFullYear(), cursor.getMonth(), 1 - (lead - i));
      items.push({
        key: toDateKey(date),
        day: date.getDate(),
        inMonth: false,
        date,
        appearances: [],
        dominant: null,
        isToday: false,
      });
    }
    for (let d = 1; d <= total; d++) {
      const date = new Date(cursor.getFullYear(), cursor.getMonth(), d);
      const key = toDateKey(date);
      const entries = entriesForDay(missions, date);
      const appearances = entries.map((e) => e.appearance);
      items.push({
        key,
        day: d,
        inMonth: true,
        date,
        appearances,
        dominant: dominantAppearance(entries),
        isToday: key === todayKey,
      });
    }
    while (items.length % 7 !== 0) {
      const last = items[items.length - 1].date;
      const date = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1);
      items.push({
        key: toDateKey(date),
        day: date.getDate(),
        inMonth: false,
        date,
        appearances: [],
        dominant: null,
        isToday: false,
      });
    }
    return items;
  }, [cursor, missions]);

  const dayEntries = useMemo(
    () => entriesForDay(missions, selectedDate),
    [missions, selectedDate]
  );

  const weekdays = locale === "en" ? WEEKDAYS_EN : WEEKDAYS_ZH;

  const dayHeading = useMemo(() => {
    const opts: Intl.DateTimeFormatOptions = {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    };
    const label = selectedDate.toLocaleDateString(
      locale === "en" ? "en-US" : "zh-HK",
      opts
    );
    if (selectedKey === toDateKey(new Date())) {
      return `${t(locale, "today")} · ${label}`;
    }
    return label;
  }, [selectedDate, selectedKey, locale]);

  return (
    <div className="space-y-4">
      <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200/80 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setCursor((c) => addMonths(c, -1))}
            className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            aria-label={t(locale, "prevMonth")}
          >
            ‹
          </button>
          <h1 className="text-lg font-bold text-slate-900">{monthLabel}</h1>
          <button
            type="button"
            onClick={() => setCursor((c) => addMonths(c, 1))}
            className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            aria-label={t(locale, "nextMonth")}
          >
            ›
          </button>
        </div>

        <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-400">
          {weekdays.map((w) => (
            <div key={w} className="py-1">
              {w}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {cells.map((cell) => {
            const selected = cell.key === selectedKey;
            return (
              <button
                key={cell.key}
                type="button"
                onClick={() => {
                  setSelectedKey(cell.key);
                  if (!cell.inMonth) {
                    setCursor(startOfMonth(cell.date));
                  }
                }}
                className={`flex min-h-[3.25rem] flex-col items-center rounded-xl px-1 py-1.5 text-sm transition ${
                  selected
                    ? "bg-blue-600 text-white"
                    : cell.inMonth
                      ? "hover:bg-slate-50 text-slate-900"
                      : "text-slate-300 hover:bg-slate-50"
                } ${cell.isToday && !selected ? "ring-1 ring-blue-300" : ""}`}
              >
                <span className="font-medium">{cell.day}</span>
                <span className="mt-1 flex min-h-[0.4rem] flex-wrap justify-center gap-0.5">
                  {cell.appearances.slice(0, 3).map((a, i) => (
                    <span
                      key={`${cell.key}-${a}-${i}`}
                      className={`h-1.5 w-1.5 rounded-full ${
                        selected ? "bg-white/90" : appearanceDotClass[a]
                      }`}
                    />
                  ))}
                  {cell.appearances.length > 3 && (
                    <span
                      className={`text-[9px] leading-none ${
                        selected ? "text-white/80" : "text-slate-400"
                      }`}
                    >
                      +
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {(
            [
              "todo",
              "inProgress",
              "done",
              "deadlineDay",
              "overdue",
            ] as CalendarAppearance[]
          ).map((a) => (
            <div
              key={a}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-50 px-2 py-2 text-xs font-medium text-slate-600"
            >
              <span className={`h-2 w-2 rounded-full ${appearanceDotClass[a]}`} />
              {appearanceLabel(locale, a)}
            </div>
          ))}
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">{dayHeading}</h2>
        {dayEntries.length === 0 ? (
          <p className="rounded-2xl bg-white p-6 text-sm text-slate-500 shadow-sm ring-1 ring-slate-200/80">
            {t(locale, "noMissionsThatDay")}
          </p>
        ) : (
          <>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t(locale, "missionsOnDay")}
            </p>
            <ul className="space-y-2">
              {dayEntries.map((e) => (
                <li key={e.mission.id}>
                  <Link
                    href={`/app/missions/${e.mission.id}`}
                    className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200/80 hover:ring-blue-200"
                  >
                    <div className="min-w-0">
                      <div className="mb-1 flex flex-wrap gap-1">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${appearanceBadgeClass[e.appearance]}`}
                        >
                          {appearanceLabel(locale, e.appearance)}
                        </span>
                      </div>
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {e.mission.title}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {e.mission.due_date
                          ? `${t(locale, "dueDate")}: ${e.mission.due_date}`
                          : "—"}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
