"use client";

import { leaveEntriesOnDay } from "@/components/schedule-leave-panel";
import { addDays, startOfWeekMonday, toDateKey } from "@/lib/calendar";
import { dateLocale } from "@/lib/format";
import { t } from "@/lib/i18n";
import type {
  LeaveEntryRow,
  Locale,
  ProfileRow,
  ShiftRow,
} from "@/lib/types";

type Member = { user_id: string; role: string; nickname: string | null };

function memberLabel(
  userId: string,
  members: Member[],
  profiles: Record<string, ProfileRow>,
  fallback: string
) {
  const nick = members.find((m) => m.user_id === userId)?.nickname?.trim();
  if (nick) return nick;
  const name = profiles[userId]?.display_name?.trim();
  if (name) return name;
  return fallback;
}

function shiftChipLabel(shift: ShiftRow): string {
  const title = shift.title?.trim();
  if (title) return title.length > 4 ? title.slice(0, 4) : title;
  const start = new Date(shift.start_at);
  return `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`;
}

export function ScheduleWeekMatrix({
  locale,
  weekAnchorKey,
  members,
  profiles,
  shiftsByDay,
  leaveEntries,
  selectedKey,
  paintMode,
  paintTargetUserId,
  currentUserId,
  canEdit,
  onSelectDay,
  onSelectCell,
  onPaintCell,
  onPrevWeek,
  onNextWeek,
  onThisWeek,
}: {
  locale: Locale;
  /** Any date key inside the visible week */
  weekAnchorKey: string;
  members: Member[];
  profiles: Record<string, ProfileRow>;
  shiftsByDay: Map<string, ShiftRow[]>;
  leaveEntries: LeaveEntryRow[];
  selectedKey: string;
  paintMode: boolean;
  paintTargetUserId: string;
  currentUserId: string;
  canEdit: boolean;
  onSelectDay: (dayKey: string) => void;
  onSelectCell: (userId: string, dayKey: string) => void;
  onPaintCell: (userId: string, dayKey: string) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onThisWeek: () => void;
}) {
  const [y, m, d] = weekAnchorKey.split("-").map(Number);
  const weekStart = startOfWeekMonday(new Date(y, m - 1, d));
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekKeys = weekDates.map(toDateKey);
  const todayKey = toDateKey(new Date());
  const thisWeekStart = startOfWeekMonday(new Date());
  const isCurrentWeek =
    toDateKey(weekStart) === toDateKey(thisWeekStart);

  const rows = members.filter((mem) => mem.role !== "viewer");

  const rangeLabel = (() => {
    const first = weekDates[0];
    const last = weekDates[6];
    const fmt = (dt: Date) =>
      `${dt.getMonth() + 1}/${dt.getDate()}`;
    const base = `${fmt(first)} – ${fmt(last)}`;
    if (first.getFullYear() !== new Date().getFullYear()) {
      return `${first.getFullYear()} ${base}`;
    }
    return base;
  })();

  // Summary: unique member-days with shifts / leave / empty
  let onCount = 0;
  let leaveCount = 0;
  let emptyCount = 0;
  for (const mem of rows) {
    for (const key of weekKeys) {
      const shifts = (shiftsByDay.get(key) ?? []).filter(
        (s) => s.user_id === mem.user_id
      );
      const onLeave = leaveEntriesOnDay(leaveEntries, key).some(
        (e) => e.user_id === mem.user_id
      );
      if (shifts.length > 0) onCount += 1;
      else if (onLeave) leaveCount += 1;
      else emptyCount += 1;
    }
  }

  const summary = t(locale, "scheduleWeekSummary")
    .replace("{on}", String(onCount))
    .replace("{leave}", String(leaveCount))
    .replace("{empty}", String(emptyCount));

  function dayHeadcount(key: string) {
    const ids = new Set(
      (shiftsByDay.get(key) ?? []).map((s) => s.user_id)
    );
    return ids.size;
  }

  function dayHasLeaveOnly(key: string) {
    const leave = leaveEntriesOnDay(leaveEntries, key);
    const work = dayHeadcount(key);
    return work === 0 && leave.length > 0;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onPrevWeek}
            className="rounded-md px-2.5 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            aria-label={t(locale, "prevMonth")}
          >
            ‹
          </button>
          <div className="min-w-[7rem] text-center">
            <p className="text-sm font-semibold text-slate-900">{rangeLabel}</p>
            {!isCurrentWeek ? (
              <button
                type="button"
                onClick={onThisWeek}
                className="text-[11px] font-semibold text-brand hover:underline"
              >
                {t(locale, "scheduleBackThisWeek")}
              </button>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onNextWeek}
            className="rounded-md px-2.5 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            aria-label={t(locale, "nextMonth")}
          >
            ›
          </button>
        </div>
        <p className="text-xs text-slate-500">{summary}</p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-[720px] w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80">
              <th className="sticky left-0 z-10 w-28 bg-slate-50 px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {t(locale, "scheduleMemberColumn")}
              </th>
              {weekDates.map((dt, i) => {
                const key = weekKeys[i];
                const isToday = key === todayKey;
                const selected = key === selectedKey;
                const count = dayHeadcount(key);
                const leaveOnly = dayHasLeaveOnly(key);
                return (
                  <th
                    key={key}
                    className={`min-w-[5.5rem] px-1.5 py-2 text-center ${
                      isToday ? "bg-brand/[0.06]" : ""
                    } ${selected ? "bg-brand/10" : ""}`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectDay(key)}
                      className="w-full"
                    >
                      <div className="text-[11px] font-semibold text-slate-500">
                        {dt.toLocaleDateString(dateLocale(locale), {
                          weekday: "short",
                        })}
                      </div>
                      <div
                        className={`text-sm font-semibold tabular-nums ${
                          isToday ? "text-brand" : "text-slate-900"
                        }`}
                      >
                        {dt.getDate()}
                      </div>
                      <div className="mt-0.5 text-[10px] font-semibold">
                        {count > 0 ? (
                          <span className="text-brand">{count}</span>
                        ) : leaveOnly ? (
                          <span className="text-orange-600">
                            {t(locale, "scheduleLeaveBadge")}
                          </span>
                        ) : (
                          <span className="text-slate-300">
                            {t(locale, "scheduleEmptyCell")}
                          </span>
                        )}
                      </div>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-8 text-center text-sm text-slate-500"
                >
                  {t(locale, "scheduleEmptyDay")}
                </td>
              </tr>
            ) : (
              rows.map((mem) => (
                <tr key={mem.user_id} className="hover:bg-slate-50/60">
                  <td className="sticky left-0 z-10 bg-white px-2 py-1.5 text-[13px] font-medium text-slate-800">
                    <span className="line-clamp-2">
                      {mem.user_id === currentUserId
                        ? t(locale, "scheduleForMe")
                        : memberLabel(
                            mem.user_id,
                            members,
                            profiles,
                            t(locale, "scheduleMemberFallback")
                          )}
                    </span>
                  </td>
                  {weekKeys.map((key) => {
                    const isToday = key === todayKey;
                    const selected = key === selectedKey;
                    const shifts = (shiftsByDay.get(key) ?? [])
                      .filter((s) => s.user_id === mem.user_id)
                      .slice()
                      .sort(
                        (a, b) =>
                          new Date(a.start_at).getTime() -
                          new Date(b.start_at).getTime()
                      );
                    const onLeave = leaveEntriesOnDay(leaveEntries, key).some(
                      (e) => e.user_id === mem.user_id
                    );
                    const occupied = shifts.length > 0;
                    const paintable = paintMode && canEdit && !occupied;

                    return (
                      <td
                        key={`${mem.user_id}-${key}`}
                        className={`px-1 py-1 align-top ${
                          isToday ? "bg-brand/[0.06]" : ""
                        } ${selected ? "bg-brand/[0.04]" : ""}`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            if (paintMode && canEdit) {
                              onPaintCell(mem.user_id, key);
                            } else {
                              onSelectCell(mem.user_id, key);
                            }
                          }}
                          className={`flex min-h-[44px] w-full flex-col items-stretch gap-0.5 rounded-md px-1 py-1 text-left transition ${
                            paintMode && !occupied
                              ? "hover:bg-violet-50 hover:ring-1 hover:ring-violet-200"
                              : "hover:bg-slate-100"
                          } ${
                            paintMode &&
                            paintTargetUserId === mem.user_id &&
                            !occupied
                              ? "ring-1 ring-violet-300"
                              : ""
                          }`}
                        >
                          {shifts.map((s) => (
                            <span
                              key={s.id}
                              className="truncate rounded px-1 py-0.5 text-[10px] font-semibold leading-tight"
                              style={{
                                backgroundColor: s.color || "#3B5BDB",
                                color: s.text_color || "#FFFFFF",
                              }}
                              title={s.title || undefined}
                            >
                              {shiftChipLabel(s)}
                            </span>
                          ))}
                          {!occupied && onLeave ? (
                            <span className="rounded bg-orange-100 px-1 py-0.5 text-center text-[10px] font-bold text-orange-700">
                              {t(locale, "scheduleLeaveBadge")}
                            </span>
                          ) : null}
                          {!occupied && !onLeave ? (
                            <span
                              className={`text-center text-[11px] ${
                                paintable
                                  ? "font-semibold text-violet-400"
                                  : "text-slate-300"
                              }`}
                            >
                              {paintMode && canEdit
                                ? "＋"
                                : t(locale, "scheduleEmptyCell")}
                            </span>
                          ) : null}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
