import type { MissionRow, MissionStatus } from "@/lib/types";

export type CalendarAppearance =
  | "todo"
  | "inProgress"
  | "done"
  | "deadlineDay"
  | "overdue";

export type CalendarDayEntry = {
  mission: MissionRow;
  dateKey: string;
  appearance: CalendarAppearance;
};

/** Parse YYYY-MM-DD as a local calendar date (not UTC midnight). */
export function parseDateOnly(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

export function daysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

/** Monday-first weekday index 0–6 (Mon=0 … Sun=6). */
export function mondayFirstWeekday(date: Date): number {
  return (date.getDay() + 6) % 7;
}

export function effectiveCalendarStart(mission: MissionRow): Date {
  if (mission.start_date) return startOfDay(parseDateOnly(mission.start_date));
  return startOfDay(new Date(mission.created_at));
}

export function appearsOnCalendarDay(mission: MissionRow, day: Date): boolean {
  const d = startOfDay(day);
  if (mission.status === "done") {
    if (mission.due_date && toDateKey(parseDateOnly(mission.due_date)) === toDateKey(d)) {
      return true;
    }
    if (mission.start_date && toDateKey(parseDateOnly(mission.start_date)) === toDateKey(d)) {
      return true;
    }
    return false;
  }
  return d.getTime() >= effectiveCalendarStart(mission).getTime();
}

export function calendarAppearance(
  mission: MissionRow,
  day: Date
): CalendarAppearance {
  const d = startOfDay(day);
  if (mission.status === "done") return "done";
  if (mission.due_date) {
    const dueDay = startOfDay(parseDateOnly(mission.due_date));
    if (toDateKey(dueDay) === toDateKey(d)) return "deadlineDay";
    if (d.getTime() > dueDay.getTime()) return "overdue";
  }
  return mission.status as MissionStatus;
}

export function calendarEntryForDay(
  mission: MissionRow,
  day: Date
): CalendarDayEntry | null {
  if (!appearsOnCalendarDay(mission, day)) return null;
  const d = startOfDay(day);
  return {
    mission,
    dateKey: toDateKey(d),
    appearance: calendarAppearance(mission, d),
  };
}

export function appearanceRank(a: CalendarAppearance): number {
  if (a === "overdue") return 0;
  if (a === "deadlineDay") return 1;
  return 2;
}

export function entriesForDay(
  missions: MissionRow[],
  day: Date
): CalendarDayEntry[] {
  const entries: CalendarDayEntry[] = [];
  for (const m of missions) {
    const e = calendarEntryForDay(m, day);
    if (e) entries.push(e);
  }
  entries.sort((a, b) => {
    const r = appearanceRank(a.appearance) - appearanceRank(b.appearance);
    if (r !== 0) return r;
    return a.mission.title.localeCompare(b.mission.title);
  });
  return entries;
}

/** Dominant day-cell color priority: overdue > deadline > inProgress > todo > done */
export function dominantAppearance(
  entries: CalendarDayEntry[]
): CalendarAppearance | null {
  if (entries.length === 0) return null;
  const order: CalendarAppearance[] = [
    "overdue",
    "deadlineDay",
    "inProgress",
    "todo",
    "done",
  ];
  for (const a of order) {
    if (entries.some((e) => e.appearance === a)) return a;
  }
  return entries[0].appearance;
}

export const appearanceDotClass: Record<CalendarAppearance, string> = {
  todo: "bg-slate-400",
  inProgress: "bg-orange-500",
  done: "bg-emerald-500",
  deadlineDay: "bg-red-500",
  overdue: "bg-purple-600",
};

export const appearanceBadgeClass: Record<CalendarAppearance, string> = {
  todo: "bg-slate-200 text-slate-700",
  inProgress: "bg-orange-500 text-white",
  done: "bg-emerald-600 text-white",
  deadlineDay: "bg-red-500 text-white",
  overdue: "bg-purple-600 text-white",
};
