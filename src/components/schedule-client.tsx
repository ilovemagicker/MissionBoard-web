"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createShiftAction,
  deleteShiftAction,
  updateShiftAction,
} from "@/app/actions/shifts";
import {
  addMonths,
  daysInMonth,
  mondayFirstWeekday,
  startOfMonth,
  toDateKey,
} from "@/lib/calendar";
import { dateLocale } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { Locale, ProfileRow, ShiftRow } from "@/lib/types";

const WEEKDAYS_ZH = ["一", "二", "三", "四", "五", "六", "日"];
const WEEKDAYS_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const COLOR_PRESETS = [
  { bg: "#3B82F6", fg: "#FFFFFF" },
  { bg: "#10B981", fg: "#FFFFFF" },
  { bg: "#F59E0B", fg: "#111827" },
  { bg: "#F43F5E", fg: "#FFFFFF" },
  { bg: "#8B5CF6", fg: "#FFFFFF" },
  { bg: "#64748B", fg: "#FFFFFF" },
  { bg: "#06B6D4", fg: "#083344" },
  { bg: "#F97316", fg: "#FFFFFF" },
] as const;

type Member = { user_id: string; role: string; nickname: string | null };

type FormState = {
  id?: string;
  startLocal: string;
  endLocal: string;
  title: string;
  note: string;
  color: string;
  textColor: string;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toLocalInput(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function defaultRange(dayKey: string) {
  const [y, m, d] = dayKey.split("-").map(Number);
  return {
    start: new Date(y, m - 1, d, 9, 0, 0, 0),
    end: new Date(y, m - 1, d, 17, 0, 0, 0),
  };
}

function formatTime(iso: string, locale: Locale) {
  return new Date(iso).toLocaleTimeString(dateLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
  });
}

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

function rangesOverlap(a0: Date, a1: Date, b0: Date, b1: Date) {
  return a0 < b1 && b0 < a1;
}

export function ScheduleClient({
  locale,
  spaceId,
  currentUserId,
  shifts,
  members,
  profiles,
}: {
  locale: Locale;
  spaceId: string;
  currentUserId: string;
  shifts: ShiftRow[];
  members: Member[];
  profiles: Record<string, ProfileRow>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [selectedKey, setSelectedKey] = useState(() => toDateKey(new Date()));
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const weekdays = locale === "en" ? WEEKDAYS_EN : WEEKDAYS_ZH;

  const monthLabel = useMemo(
    () =>
      cursor.toLocaleDateString(dateLocale(locale), {
        year: "numeric",
        month: "long",
      }),
    [cursor, locale]
  );

  const shiftsByDay = useMemo(() => {
    const map = new Map<string, ShiftRow[]>();
    for (const s of shifts) {
      const key = toDateKey(new Date(s.start_at));
      const list = map.get(key) ?? [];
      list.push(s);
      map.set(key, list);
    }
    return map;
  }, [shifts]);

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
      count: number;
      isToday: boolean;
    }[] = [];

    for (let i = 0; i < lead; i++) {
      const date = new Date(
        cursor.getFullYear(),
        cursor.getMonth(),
        1 - (lead - i)
      );
      const key = toDateKey(date);
      items.push({
        key,
        day: date.getDate(),
        inMonth: false,
        date,
        count: shiftsByDay.get(key)?.length ?? 0,
        isToday: false,
      });
    }
    for (let d = 1; d <= total; d++) {
      const date = new Date(cursor.getFullYear(), cursor.getMonth(), d);
      const key = toDateKey(date);
      items.push({
        key,
        day: d,
        inMonth: true,
        date,
        count: shiftsByDay.get(key)?.length ?? 0,
        isToday: key === todayKey,
      });
    }
    while (items.length % 7 !== 0) {
      const last = items[items.length - 1].date;
      const date = new Date(
        last.getFullYear(),
        last.getMonth(),
        last.getDate() + 1
      );
      const key = toDateKey(date);
      items.push({
        key,
        day: date.getDate(),
        inMonth: false,
        date,
        count: shiftsByDay.get(key)?.length ?? 0,
        isToday: false,
      });
    }
    return items;
  }, [cursor, shiftsByDay]);

  const dayShifts = useMemo(() => {
    return (shiftsByDay.get(selectedKey) ?? [])
      .slice()
      .sort(
        (a, b) =>
          new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
      );
  }, [shiftsByDay, selectedKey]);

  const onDutyUserIds = useMemo(
    () => new Set(dayShifts.map((s) => s.user_id)),
    [dayShifts]
  );

  const onDutyGroups = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, ShiftRow[]>();
    for (const s of dayShifts) {
      if (!map.has(s.user_id)) {
        map.set(s.user_id, []);
        order.push(s.user_id);
      }
      map.get(s.user_id)!.push(s);
    }
    return order.map((userId) => ({ userId, shifts: map.get(userId)! }));
  }, [dayShifts]);

  const offDutyMembers = useMemo(
    () => members.filter((m) => !onDutyUserIds.has(m.user_id)),
    [members, onDutyUserIds]
  );

  const dayHeading = useMemo(() => {
    const [y, m, d] = selectedKey.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    const label = date.toLocaleDateString(dateLocale(locale), {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    if (selectedKey === toDateKey(new Date())) {
      return `${t(locale, "today")} · ${label}`;
    }
    return label;
  }, [selectedKey, locale]);

  const overlapWarning = useMemo(() => {
    if (!form) return false;
    const start = new Date(form.startLocal);
    const end = new Date(form.endLocal);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return false;
    }
    return shifts.some((s) => {
      if (s.user_id !== currentUserId) return false;
      if (form.id && s.id === form.id) return false;
      return rangesOverlap(
        start,
        end,
        new Date(s.start_at),
        new Date(s.end_at)
      );
    });
  }, [form, shifts, currentUserId]);

  function openCreate() {
    const { start, end } = defaultRange(selectedKey);
    setError(null);
    setForm({
      startLocal: toLocalInput(start),
      endLocal: toLocalInput(end),
      title: "",
      note: "",
      color: COLOR_PRESETS[0].bg,
      textColor: COLOR_PRESETS[0].fg,
    });
  }

  function openEdit(shift: ShiftRow) {
    setError(null);
    setForm({
      id: shift.id,
      startLocal: toLocalInput(new Date(shift.start_at)),
      endLocal: toLocalInput(new Date(shift.end_at)),
      title: shift.title ?? "",
      note: shift.note ?? "",
      color: shift.color || COLOR_PRESETS[0].bg,
      textColor: shift.text_color || COLOR_PRESETS[0].fg,
    });
  }

  function submitForm() {
    if (!form) return;
    setError(null);
    startTransition(async () => {
      const payload = {
        startAt: new Date(form.startLocal).toISOString(),
        endAt: new Date(form.endLocal).toISOString(),
        title: form.title,
        note: form.note,
        color: form.color,
        textColor: form.textColor,
      };
      const result = form.id
        ? await updateShiftAction({ id: form.id, ...payload })
        : await createShiftAction({ spaceId, ...payload });
      if (result && "error" in result && result.error) {
        setError(result.error);
        return;
      }
      setForm(null);
      router.refresh();
    });
  }

  function confirmDelete() {
    if (!confirmDeleteId) return;
    const id = confirmDeleteId;
    setConfirmDeleteId(null);
    startTransition(async () => {
      const result = await deleteShiftAction(id);
      if (result && "error" in result && result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-slate-900">
          {t(locale, "scheduleTitle")}
        </h1>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex h-10 items-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
        >
          {t(locale, "scheduleAdd")}
        </button>
      </div>

      {error ? (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

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
          <h2 className="text-lg font-bold text-slate-900">{monthLabel}</h2>
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
                  if (!cell.inMonth) setCursor(startOfMonth(cell.date));
                }}
                className={`flex min-h-[3.25rem] flex-col items-center rounded-xl px-1 py-1.5 text-sm transition ${
                  selected
                    ? "bg-blue-600 text-white"
                    : cell.inMonth
                      ? "text-slate-900 hover:bg-slate-50"
                      : "text-slate-300 hover:bg-slate-50"
                } ${cell.isToday && !selected ? "ring-1 ring-blue-300" : ""}`}
              >
                <span className="font-medium">{cell.day}</span>
                {cell.count > 0 ? (
                  <span
                    className={`mt-1 rounded-full px-1.5 text-[10px] font-bold leading-4 ${
                      selected
                        ? "bg-white/20 text-white"
                        : "bg-blue-50 text-blue-700"
                    }`}
                  >
                    {cell.count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-700">{dayHeading}</h2>
          <button
            type="button"
            onClick={openCreate}
            className="text-sm font-semibold text-blue-600 hover:underline"
          >
            {t(locale, "scheduleAdd")}
          </button>
        </div>

        <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200/80 sm:p-5">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">
            {t(locale, "scheduleOnDuty")}
          </h3>
          {onDutyGroups.length === 0 ? (
            <div className="rounded-2xl bg-slate-50 px-4 py-6 text-center">
              <p className="text-sm text-slate-500">
                {t(locale, "scheduleEmptyDay")}
              </p>
              <button
                type="button"
                onClick={openCreate}
                className="mt-3 inline-flex h-9 items-center rounded-xl bg-blue-600 px-3 text-sm font-semibold text-white"
              >
                {t(locale, "scheduleEmptyCta")}
              </button>
            </div>
          ) : (
            <ul className="space-y-3">
              {onDutyGroups.map((g) => (
                <li key={g.userId} className="space-y-2">
                  <p className="text-sm font-semibold text-slate-800">
                    {memberLabel(
                      g.userId,
                      members,
                      profiles,
                      t(locale, "scheduleMemberFallback")
                    )}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {g.shifts.map((s) => {
                      const canEdit = s.user_id === currentUserId;
                      return (
                        <div
                          key={s.id}
                          className="inline-flex max-w-full flex-col gap-1 rounded-xl px-3 py-2 text-left shadow-sm"
                          style={{
                            backgroundColor: s.color || "#3B82F6",
                            color: s.text_color || "#FFFFFF",
                          }}
                        >
                          <span className="text-sm font-semibold">
                            {formatTime(s.start_at, locale)} –{" "}
                            {formatTime(s.end_at, locale)}
                            {s.title ? ` · ${s.title}` : ""}
                          </span>
                          {s.note ? (
                            <span className="text-xs opacity-90">{s.note}</span>
                          ) : null}
                          {canEdit ? (
                            <span className="mt-1 flex gap-2 text-xs font-semibold">
                              <button
                                type="button"
                                className="underline opacity-95"
                                onClick={() => openEdit(s)}
                              >
                                {t(locale, "scheduleEdit")}
                              </button>
                              <button
                                type="button"
                                className="underline opacity-95"
                                onClick={() => setConfirmDeleteId(s.id)}
                              >
                                {t(locale, "scheduleDelete")}
                              </button>
                            </span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200/80 sm:p-5">
          <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
            {t(locale, "scheduleOffDuty")}
          </h3>
          <p className="mb-3 text-xs text-slate-400">
            {t(locale, "scheduleOffDutyHint")}
          </p>
          {offDutyMembers.length === 0 ? (
            <p className="text-sm text-slate-500">
              {t(locale, "scheduleOffDutyEmpty")}
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {offDutyMembers.map((m) => (
                <li
                  key={m.user_id}
                  className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600"
                >
                  {memberLabel(
                    m.user_id,
                    members,
                    profiles,
                    t(locale, "scheduleMemberFallback")
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {form ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">
              {form.id ? t(locale, "scheduleEdit") : t(locale, "scheduleAdd")}
            </h3>
            <div className="mt-4 space-y-3">
              <label className="block text-xs font-semibold text-slate-500">
                {t(locale, "scheduleStart")}
                <input
                  type="datetime-local"
                  value={form.startLocal}
                  onChange={(e) =>
                    setForm({ ...form, startLocal: e.target.value })
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-500">
                {t(locale, "scheduleEnd")}
                <input
                  type="datetime-local"
                  value={form.endLocal}
                  onChange={(e) =>
                    setForm({ ...form, endLocal: e.target.value })
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-500">
                {t(locale, "scheduleTitleField")}
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-500">
                {t(locale, "scheduleNoteField")}
                <textarea
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  rows={2}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <div>
                <p className="text-xs font-semibold text-slate-500">
                  {t(locale, "scheduleColor")} / {t(locale, "scheduleTextColor")}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {COLOR_PRESETS.map((p) => (
                    <button
                      key={p.bg}
                      type="button"
                      onClick={() =>
                        setForm({ ...form, color: p.bg, textColor: p.fg })
                      }
                      className={`h-8 w-8 rounded-full ring-2 ${
                        form.color === p.bg
                          ? "ring-slate-900"
                          : "ring-transparent"
                      }`}
                      style={{ backgroundColor: p.bg }}
                      aria-label={p.bg}
                    />
                  ))}
                </div>
              </div>
              {overlapWarning ? (
                <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {t(locale, "scheduleOverlapHint")}
                </p>
              ) : null}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setForm(null)}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                disabled={pending}
              >
                {t(locale, "cancel")}
              </button>
              <button
                type="button"
                onClick={submitForm}
                disabled={pending}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {t(locale, "save")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmDeleteId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-xl">
            <p className="text-sm font-semibold text-slate-800">
              {t(locale, "scheduleDeleteConfirm")}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              >
                {t(locale, "cancel")}
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={pending}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                {t(locale, "delete")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
