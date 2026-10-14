"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createLeaveAction,
  deleteLeaveAction,
  updateLeaveAction,
} from "@/app/actions/leave";
import { t } from "@/lib/i18n";
import type { LeaveEntryRow, Locale, ProfileRow } from "@/lib/types";

type Member = { user_id: string; role: string; nickname: string | null };

const FRACTIONS = [1, 0.75, 0.5, 0.25] as const;

function memberLabel(
  userId: string,
  members: Member[],
  profiles: Record<string, ProfileRow>,
  fallback: string
) {
  const m = members.find((x) => x.user_id === userId);
  if (m?.nickname?.trim()) return m.nickname.trim();
  const p = profiles[userId];
  if (p?.display_name?.trim()) return p.display_name.trim();
  return fallback;
}

function isAdminLike(members: Member[], userId: string) {
  const role = members.find((m) => m.user_id === userId)?.role;
  return role === "owner" || role === "admin";
}

function canEditLeave(
  entry: LeaveEntryRow,
  currentUserId: string,
  members: Member[]
) {
  return entry.user_id === currentUserId || isAdminLike(members, currentUserId);
}

function coversDay(entry: LeaveEntryRow, dayKey: string) {
  return entry.start_date <= dayKey && entry.end_date >= dayKey;
}

function fractionLabel(locale: Locale, fraction: number) {
  if (fraction >= 0.999) return t(locale, "scheduleLeaveFullDay");
  return t(locale, "scheduleLeaveFractionDays").replace(
    "{n}",
    String(fraction)
  );
}

type EditorState = {
  id?: string;
  startDate: string;
  endDate: string;
  dayFraction: number;
  note: string;
};

export function leaveEntriesOnDay(entries: LeaveEntryRow[], dayKey: string) {
  return entries.filter((e) => coversDay(e, dayKey));
}

export function ScheduleLeavePanel({
  locale,
  spaceId,
  currentUserId,
  members,
  profiles,
  leaveEntries,
  selectedDayKey,
  open,
  onClose,
}: {
  locale: Locale;
  spaceId: string;
  currentUserId: string;
  members: Member[];
  profiles: Record<string, ProfileRow>;
  leaveEntries: LeaveEntryRow[];
  selectedDayKey: string;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const sorted = useMemo(
    () =>
      leaveEntries
        .slice()
        .sort((a, b) =>
          b.start_date === a.start_date
            ? b.end_date.localeCompare(a.end_date)
            : b.start_date.localeCompare(a.start_date)
        ),
    [leaveEntries]
  );

  if (!open) return null;

  function openCreate() {
    setError(null);
    setEditor({
      startDate: selectedDayKey,
      endDate: selectedDayKey,
      dayFraction: 1,
      note: "",
    });
  }

  function openEdit(entry: LeaveEntryRow) {
    setError(null);
    setEditor({
      id: entry.id,
      startDate: entry.start_date,
      endDate: entry.end_date,
      dayFraction: Number(entry.day_fraction),
      note: entry.note ?? "",
    });
  }

  function saveEditor() {
    if (!editor) return;
    startTransition(async () => {
      setError(null);
      const payload = {
        startDate: editor.startDate,
        endDate: editor.endDate,
        dayFraction: editor.dayFraction,
        note: editor.note,
      };
      const result = editor.id
        ? await updateLeaveAction({ id: editor.id, ...payload })
        : await createLeaveAction({ spaceId, ...payload });
      if (result && "error" in result && result.error) {
        setError(result.error);
        return;
      }
      setEditor(null);
      router.refresh();
    });
  }

  function doDelete(id: string) {
    startTransition(async () => {
      setError(null);
      const result = await deleteLeaveAction(id);
      if (result && "error" in result && result.error) {
        setError(result.error);
        return;
      }
      setConfirmDeleteId(null);
      router.refresh();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-3xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-lg font-bold text-slate-900">
            {t(locale, "scheduleLeaveTitle")}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          >
            {t(locale, "close")}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="mb-4 text-xs text-slate-500">
            {t(locale, "scheduleLeaveHint")}
          </p>

          {error ? (
            <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <div className="mb-3 flex justify-end">
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex h-9 items-center rounded-xl bg-orange-600 px-3 text-sm font-semibold text-white hover:bg-orange-700"
            >
              {t(locale, "scheduleLeaveAdd")}
            </button>
          </div>

          {sorted.length === 0 ? (
            <p className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              {t(locale, "scheduleLeaveEmpty")}
            </p>
          ) : (
            <ul className="space-y-2">
              {sorted.map((entry) => {
                const editable = canEditLeave(entry, currentUserId, members);
                const range =
                  entry.start_date === entry.end_date
                    ? entry.start_date
                    : `${entry.start_date} – ${entry.end_date}`;
                return (
                  <li
                    key={entry.id}
                    className="rounded-2xl bg-orange-50/60 px-4 py-3 ring-1 ring-orange-100"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {range}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-600">
                          {memberLabel(
                            entry.user_id,
                            members,
                            profiles,
                            t(locale, "scheduleMemberFallback")
                          )}{" "}
                          · {fractionLabel(locale, Number(entry.day_fraction))}
                          {entry.note ? ` · ${entry.note}` : ""}
                        </p>
                      </div>
                      {editable ? (
                        <div className="flex shrink-0 gap-2 text-xs font-semibold">
                          <button
                            type="button"
                            className="text-orange-700 hover:underline"
                            onClick={() => openEdit(entry)}
                          >
                            {t(locale, "scheduleLeaveEdit")}
                          </button>
                          <button
                            type="button"
                            className="text-red-600 hover:underline"
                            onClick={() => setConfirmDeleteId(entry.id)}
                          >
                            {t(locale, "scheduleLeaveDelete")}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {editor ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-xl">
            <h4 className="text-lg font-bold text-slate-900">
              {editor.id
                ? t(locale, "scheduleLeaveEdit")
                : t(locale, "scheduleLeaveAdd")}
            </h4>
            <div className="mt-4 space-y-3">
              <label className="block text-xs font-semibold text-slate-500">
                {t(locale, "scheduleLeaveStart")}
                <input
                  type="date"
                  value={editor.startDate}
                  onChange={(e) =>
                    setEditor({ ...editor, startDate: e.target.value })
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-500">
                {t(locale, "scheduleLeaveEnd")}
                <input
                  type="date"
                  value={editor.endDate}
                  onChange={(e) =>
                    setEditor({ ...editor, endDate: e.target.value })
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-500">
                {t(locale, "scheduleLeaveFraction")}
                <select
                  value={editor.dayFraction}
                  onChange={(e) =>
                    setEditor({
                      ...editor,
                      dayFraction: Number(e.target.value),
                    })
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                >
                  {FRACTIONS.map((f) => (
                    <option key={f} value={f}>
                      {fractionLabel(locale, f)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-semibold text-slate-500">
                {t(locale, "scheduleLeaveNote")}
                <input
                  type="text"
                  value={editor.note}
                  onChange={(e) =>
                    setEditor({ ...editor, note: e.target.value })
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditor(null)}
                className="h-10 rounded-xl px-4 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              >
                {t(locale, "cancel")}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={saveEditor}
                className="h-10 rounded-xl bg-orange-600 px-4 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
              >
                {t(locale, "save")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmDeleteId ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-xl">
            <p className="text-sm text-slate-800">
              {t(locale, "scheduleLeaveDeleteConfirm")}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                className="h-10 rounded-xl px-4 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              >
                {t(locale, "cancel")}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => doDelete(confirmDeleteId)}
                className="h-10 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {t(locale, "scheduleLeaveDelete")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
