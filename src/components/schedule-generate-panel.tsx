"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  generateShiftsBatchAction,
  undoGenerationBatchAction,
} from "@/app/actions/shifts";
import { toDateKey } from "@/lib/calendar";
import { t } from "@/lib/i18n";
import {
  lastBatchStorageKey,
  monthRangeKeys,
  planGeneration,
  type ConflictPolicy,
  type GenerateMode,
  type GeneratePatternKind,
} from "@/lib/shift-generation";
import type { Locale, ProfileRow, ShiftRow, ShiftTemplateRow } from "@/lib/types";

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

function monthInputValue(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function parseMonthInput(value: string): { year: number; monthIndex0: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const monthIndex0 = Number(m[2]) - 1;
  if (!Number.isFinite(year) || monthIndex0 < 0 || monthIndex0 > 11) return null;
  return { year, monthIndex0 };
}

export function ScheduleGeneratePanel({
  locale,
  spaceId,
  currentUserId,
  isAdmin,
  members,
  profiles,
  templates,
  shifts,
  cursorMonth,
  onClose,
}: {
  locale: Locale;
  spaceId: string;
  currentUserId: string;
  isAdmin: boolean;
  members: Member[];
  profiles: Record<string, ProfileRow>;
  templates: ShiftTemplateRow[];
  shifts: ShiftRow[];
  cursorMonth: Date;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const assignable = useMemo(
    () => members.filter((m) => m.role !== "viewer"),
    [members]
  );

  const [monthValue, setMonthValue] = useState(() => monthInputValue(cursorMonth));
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>(() =>
    templates.slice(0, 1).map((t) => t.id)
  );
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([currentUserId]);
  const [pattern, setPattern] = useState<GeneratePatternKind>("4on4off");
  const [mode, setMode] = useState<GenerateMode>("samePhase");
  const [conflict, setConflict] = useState<ConflictPolicy>("skip");
  const [error, setError] = useState<string | null>(null);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [lastBatchId, setLastBatchId] = useState<string | null>(null);
  const [confirmUndo, setConfirmUndo] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(lastBatchStorageKey(spaceId));
      setLastBatchId(raw && raw.length > 0 ? raw : null);
    } catch {
      setLastBatchId(null);
    }
  }, [spaceId]);

  const selectedTemplates = useMemo(
    () =>
      selectedTemplateIds
        .map((id) => templates.find((t) => t.id === id))
        .filter(Boolean) as ShiftTemplateRow[],
    [selectedTemplateIds, templates]
  );

  const range = useMemo(() => {
    const parsed = parseMonthInput(monthValue);
    if (!parsed) {
      return monthRangeKeys(cursorMonth.getFullYear(), cursorMonth.getMonth());
    }
    return monthRangeKeys(parsed.year, parsed.monthIndex0);
  }, [monthValue, cursorMonth]);

  const occupied = useMemo(() => {
    const set = new Set<string>();
    for (const s of shifts) {
      if (s.status !== "scheduled") continue;
      set.add(`${s.user_id}|${toDateKey(new Date(s.start_at))}`);
    }
    return set;
  }, [shifts]);

  const preview = useMemo(() => {
    if (!selectedTemplates.length || !selectedUserIds.length) {
      return {
        drafts: [],
        skipped: 0,
        restDays: 0,
        overwriteCount: 0,
        capped: false,
      };
    }
    return planGeneration({
      templates: selectedTemplates,
      userIds: selectedUserIds,
      startKey: range.startKey,
      endKey: range.endKey,
      pattern,
      mode,
      conflict,
      occupiedDayKeys: occupied,
    });
  }, [
    selectedTemplates,
    selectedUserIds,
    range,
    pattern,
    mode,
    conflict,
    occupied,
  ]);

  function toggleTemplate(id: string) {
    setSelectedTemplateIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleUser(id: string) {
    if (!isAdmin && id !== currentUserId) return;
    setSelectedUserIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function rememberBatch(id: string | null) {
    setLastBatchId(id);
    try {
      const key = lastBatchStorageKey(spaceId);
      if (id) localStorage.setItem(key, id);
      else localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }

  function runGenerate() {
    setError(null);
    setResultMsg(null);
    if (!selectedTemplates.length) {
      setError(t(locale, "scheduleGenerateNeedTemplate"));
      return;
    }
    if (!selectedUserIds.length) {
      setError(t(locale, "scheduleGenerateMembers"));
      return;
    }
    startTransition(async () => {
      const result = await generateShiftsBatchAction({
        spaceId,
        startKey: range.startKey,
        endKey: range.endKey,
        templateIds: selectedTemplateIds,
        userIds: selectedUserIds,
        pattern,
        mode,
        conflict,
      });
      if ("error" in result) {
        setError(result.error || t(locale, "error"));
        return;
      }
      if (result.created === 0) {
        setResultMsg(t(locale, "scheduleGenerateEmpty"));
      } else {
        setResultMsg(
          t(locale, "scheduleGenerateDone").replace("{n}", String(result.created))
        );
      }
      if (result.batchId) rememberBatch(result.batchId);
      router.refresh();
    });
  }

  function runUndo() {
    if (!lastBatchId) {
      setError(t(locale, "scheduleGenerateNoBatch"));
      return;
    }
    setError(null);
    setResultMsg(null);
    startTransition(async () => {
      const result = await undoGenerationBatchAction({
        spaceId,
        batchId: lastBatchId,
      });
      if ("error" in result) {
        setError(result.error || t(locale, "error"));
        setConfirmUndo(false);
        return;
      }
      setResultMsg(
        t(locale, "scheduleGenerateUndoDone").replace(
          "{n}",
          String(result.deleted ?? 0)
        )
      );
      rememberBatch(null);
      setConfirmUndo(false);
      router.refresh();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-5 shadow-xl ring-1 ring-slate-200"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {t(locale, "scheduleGenerateTitle")}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {t(locale, "scheduleGenerateHint")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100"
          >
            {t(locale, "cancel")}
          </button>
        </div>

        <label className="mt-4 block text-xs font-semibold text-slate-700">
          {t(locale, "scheduleGenerateMonth")}
          <input
            type="month"
            value={monthValue}
            onChange={(e) => setMonthValue(e.target.value)}
            className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
          />
        </label>

        <div className="mt-4">
          <p className="text-xs font-semibold text-slate-700">
            {t(locale, "scheduleGenerateTemplates")}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {t(locale, "scheduleGenerateTemplatesHint")}
          </p>
          {templates.length === 0 ? (
            <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {t(locale, "scheduleGenerateNeedTemplate")}
            </p>
          ) : (
            <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto">
              {templates.map((tmpl) => {
                const on = selectedTemplateIds.includes(tmpl.id);
                return (
                  <li key={tmpl.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-sm hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggleTemplate(tmpl.id)}
                      />
                      <span
                        className="inline-block h-3 w-3 rounded-full"
                        style={{ background: tmpl.color }}
                      />
                      <span className="font-medium text-slate-800">{tmpl.name}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-slate-700">
              {t(locale, "scheduleGenerateMembers")}
            </p>
            {isAdmin && assignable.length > 1 ? (
              <div className="flex gap-2 text-[11px] font-semibold">
                <button
                  type="button"
                  className="text-blue-600 hover:underline"
                  onClick={() =>
                    setSelectedUserIds(assignable.map((m) => m.user_id))
                  }
                >
                  {t(locale, "scheduleGenerateSelectAll")}
                </button>
                <button
                  type="button"
                  className="text-slate-500 hover:underline"
                  onClick={() => setSelectedUserIds([currentUserId])}
                >
                  {t(locale, "scheduleGenerateSelectNone")}
                </button>
              </div>
            ) : null}
          </div>
          <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto">
            {(isAdmin ? assignable : assignable.filter((m) => m.user_id === currentUserId)).map(
              (m) => {
                const on = selectedUserIds.includes(m.user_id);
                return (
                  <li key={m.user_id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-sm hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={!isAdmin && m.user_id !== currentUserId}
                        onChange={() => toggleUser(m.user_id)}
                      />
                      <span className="font-medium text-slate-800">
                        {memberLabel(
                          m.user_id,
                          members,
                          profiles,
                          t(locale, "scheduleMemberFallback")
                        )}
                        {m.user_id === currentUserId
                          ? ` (${t(locale, "scheduleForMe")})`
                          : ""}
                      </span>
                    </label>
                  </li>
                );
              }
            )}
          </ul>
        </div>

        <label className="mt-4 block text-xs font-semibold text-slate-700">
          {t(locale, "scheduleGeneratePattern")}
          <select
            value={pattern}
            onChange={(e) => setPattern(e.target.value as GeneratePatternKind)}
            className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
          >
            <option value="everyday">
              {t(locale, "scheduleGeneratePatternEveryday")}
            </option>
            <option value="weekdays">
              {t(locale, "scheduleGeneratePatternWeekdays")}
            </option>
            <option value="4on4off">
              {t(locale, "scheduleGeneratePattern4on4off")}
            </option>
            <option value="5on2off">
              {t(locale, "scheduleGeneratePattern5on2off")}
            </option>
          </select>
        </label>

        {selectedUserIds.length > 1 && pattern !== "weekdays" ? (
          <label className="mt-4 block text-xs font-semibold text-slate-700">
            {t(locale, "scheduleGenerateMode")}
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as GenerateMode)}
              className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
            >
              <option value="samePhase">
                {t(locale, "scheduleGenerateModeSamePhase")}
              </option>
              <option value="staggered">
                {t(locale, "scheduleGenerateModeStaggered")}
              </option>
            </select>
            <span className="mt-1 block text-[11px] font-normal text-slate-500">
              {mode === "staggered"
                ? t(locale, "scheduleGenerateModeHintStaggered")
                : t(locale, "scheduleGenerateModeHintSame")}
            </span>
          </label>
        ) : null}

        <label className="mt-4 block text-xs font-semibold text-slate-700">
          {t(locale, "scheduleGenerateConflict")}
          <select
            value={conflict}
            onChange={(e) => setConflict(e.target.value as ConflictPolicy)}
            className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
          >
            <option value="skip">
              {t(locale, "scheduleGenerateConflictSkip")}
            </option>
            <option value="overwrite">
              {t(locale, "scheduleGenerateConflictOverwrite")}
            </option>
          </select>
          <span className="mt-1 block text-[11px] font-normal text-slate-500">
            {t(locale, "scheduleGenerateConflictHint")}
          </span>
        </label>

        <div className="mt-4 rounded-2xl bg-slate-50 px-3 py-3 text-xs text-slate-700 ring-1 ring-slate-100">
          <p className="font-semibold">{t(locale, "scheduleGeneratePreview")}</p>
          <p className="mt-1">
            {t(locale, "scheduleGeneratePreviewCount").replace(
              "{n}",
              String(preview.drafts.length)
            )}
          </p>
          {preview.skipped > 0 ? (
            <p className="mt-0.5 text-amber-700">
              {t(locale, "scheduleGeneratePreviewSkip").replace(
                "{n}",
                String(preview.skipped)
              )}
            </p>
          ) : null}
          {preview.overwriteCount > 0 ? (
            <p className="mt-0.5 text-amber-700">
              {t(locale, "scheduleGeneratePreviewOverwrite").replace(
                "{n}",
                String(preview.overwriteCount)
              )}
            </p>
          ) : null}
          <p className="mt-0.5 text-slate-500">
            {t(locale, "scheduleGeneratePreviewRest").replace(
              "{n}",
              String(preview.restDays)
            )}
          </p>
        </div>

        {error ? (
          <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {resultMsg ? (
          <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {resultMsg}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending || templates.length === 0}
            onClick={runGenerate}
            className="inline-flex h-10 flex-1 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {pending
              ? t(locale, "scheduleGenerateWorking")
              : t(locale, "scheduleGenerateConfirm")}
          </button>
          {lastBatchId ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirmUndo(true)}
              className="inline-flex h-10 items-center rounded-xl bg-white px-4 text-sm font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-60"
            >
              {t(locale, "scheduleGenerateUndo")}
            </button>
          ) : null}
        </div>

        {confirmUndo ? (
          <div className="mt-3 rounded-2xl bg-red-50 p-3 ring-1 ring-red-100">
            <p className="text-sm text-red-800">
              {t(locale, "scheduleGenerateUndoConfirm")}
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={runUndo}
                className="inline-flex h-9 items-center rounded-xl bg-red-600 px-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {t(locale, "scheduleGenerateUndo")}
              </button>
              <button
                type="button"
                onClick={() => setConfirmUndo(false)}
                className="inline-flex h-9 items-center rounded-xl bg-white px-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200"
              >
                {t(locale, "cancel")}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
