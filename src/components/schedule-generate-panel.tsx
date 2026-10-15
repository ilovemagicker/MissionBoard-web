"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  clearGeneratedShiftsInRangeAction,
  generateShiftsBatchAction,
  undoGenerationBatchAction,
} from "@/app/actions/shifts";
import { toDateKey } from "@/lib/calendar";
import { t } from "@/lib/i18n";
import {
  cycleHasWork,
  defaultGenerateRangeKeys,
  enumerateDayKeys,
  lastBatchStorageKey,
  monthRangeKeys,
  planGeneration,
  seedCustomCycle,
  serializePatternCycle,
  type ConflictPolicy,
  type GenerateMode,
  type GeneratePatternKind,
  type PatternBlock,
} from "@/lib/shift-generation";
import type { Locale, ProfileRow, ShiftRow, ShiftTemplateRow } from "@/lib/types";

type Member = { user_id: string; role: string; nickname: string | null };
type WizardStep = "range" | "pattern" | "preview" | "done";

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

function minutesLabel(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
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

  const defaults = useMemo(() => {
    // Prefer current calendar month when opened from schedule; else today…+27.
    const month = monthRangeKeys(
      cursorMonth.getFullYear(),
      cursorMonth.getMonth()
    );
    const todayRange = defaultGenerateRangeKeys();
    // If cursor month overlaps "today", keep month; otherwise use today…+27.
    const today = toDateKey(new Date());
    if (today >= month.startKey && today <= month.endKey) {
      return { startKey: month.startKey, endKey: month.endKey };
    }
    return todayRange;
  }, [cursorMonth]);

  const [step, setStep] = useState<WizardStep>("range");
  const [startKey, setStartKey] = useState(defaults.startKey);
  const [endKey, setEndKey] = useState(defaults.endKey);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([
    currentUserId,
  ]);
  const [mode, setMode] = useState<GenerateMode>("samePhase");
  const [conflict, setConflict] = useState<ConflictPolicy>("skip");
  /** "weekdays" is calendar-based; otherwise use customCycle. */
  const [patternKind, setPatternKind] = useState<
    GeneratePatternKind | "custom"
  >("custom");
  const [customCycle, setCustomCycle] = useState<PatternBlock[]>(() =>
    templates.length ? seedCustomCycle("4on4off", templates) : []
  );
  const [error, setError] = useState<string | null>(null);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [writtenCount, setWrittenCount] = useState(0);
  const [lastBatchId, setLastBatchId] = useState<string | null>(null);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(lastBatchStorageKey(spaceId));
      setLastBatchId(raw && raw.length > 0 ? raw : null);
    } catch {
      setLastBatchId(null);
    }
  }, [spaceId]);

  // If templates load after mount with empty cycle, seed once.
  useEffect(() => {
    if (customCycle.length === 0 && templates.length > 0) {
      setCustomCycle(seedCustomCycle("4on4off", templates));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates]);

  const occupied = useMemo(() => {
    const set = new Set<string>();
    for (const s of shifts) {
      if (s.status !== "scheduled") continue;
      set.add(`${s.user_id}|${toDateKey(new Date(s.start_at))}`);
    }
    return set;
  }, [shifts]);

  const rangeMeta = useMemo(
    () => enumerateDayKeys(startKey, endKey),
    [startKey, endKey]
  );

  const preview = useMemo(() => {
    if (!selectedUserIds.length) {
      return {
        drafts: [],
        skipped: 0,
        restDays: 0,
        overwriteCount: 0,
        capped: false,
      };
    }
    if (patternKind === "weekdays") {
      if (!templates.length) {
        return {
          drafts: [],
          skipped: 0,
          restDays: 0,
          overwriteCount: 0,
          capped: rangeMeta.capped,
        };
      }
      return planGeneration({
        templates,
        userIds: selectedUserIds,
        startKey,
        endKey,
        pattern: "weekdays",
        mode,
        conflict,
        occupiedDayKeys: occupied,
      });
    }
    if (!cycleHasWork(customCycle)) {
      return {
        drafts: [],
        skipped: 0,
        restDays: 0,
        overwriteCount: 0,
        capped: rangeMeta.capped,
      };
    }
    return planGeneration({
      templates,
      userIds: selectedUserIds,
      startKey,
      endKey,
      customCycle,
      mode,
      conflict,
      occupiedDayKeys: occupied,
    });
  }, [
    selectedUserIds,
    patternKind,
    templates,
    customCycle,
    startKey,
    endKey,
    mode,
    conflict,
    occupied,
    rangeMeta.capped,
  ]);

  const sampleDrafts = useMemo(
    () => preview.drafts.slice(0, 8),
    [preview.drafts]
  );

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

  function applyPreset(kind: GeneratePatternKind) {
    if (kind === "weekdays") {
      setPatternKind("weekdays");
      return;
    }
    setPatternKind("custom");
    if (!templates.length) {
      setCustomCycle([]);
      return;
    }
    setCustomCycle(seedCustomCycle(kind, templates));
  }

  function appendWork(tmpl: ShiftTemplateRow) {
    setPatternKind("custom");
    setCustomCycle((prev) => [...prev, { kind: "work", template: tmpl }]);
  }

  function appendRest() {
    setPatternKind("custom");
    setCustomCycle((prev) => [...prev, { kind: "rest" }]);
  }

  function removeBlock(index: number) {
    setPatternKind("custom");
    setCustomCycle((prev) => prev.filter((_, i) => i !== index));
  }

  function moveBlock(index: number, dir: -1 | 1) {
    setPatternKind("custom");
    setCustomCycle((prev) => {
      const next = [...prev];
      const j = index + dir;
      if (j < 0 || j >= next.length) return prev;
      const tmp = next[index];
      next[index] = next[j];
      next[j] = tmp;
      return next;
    });
  }

  function canAdvanceFromRange() {
    if (!selectedUserIds.length) return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startKey)) return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(endKey)) return false;
    if (endKey < startKey) return false;
    return true;
  }

  function canAdvanceFromPattern() {
    if (patternKind === "weekdays") return templates.length > 0;
    return cycleHasWork(customCycle);
  }

  function goNext() {
    setError(null);
    setResultMsg(null);
    if (step === "range") {
      if (!canAdvanceFromRange()) {
        setError(
          !selectedUserIds.length
            ? t(locale, "scheduleGenerateMembers")
            : t(locale, "scheduleGenerateRangeInvalid")
        );
        return;
      }
      setStep("pattern");
      return;
    }
    if (step === "pattern") {
      if (!canAdvanceFromPattern()) {
        setError(
          templates.length === 0
            ? t(locale, "scheduleGenerateNeedTemplate")
            : t(locale, "scheduleGeneratePatternEmpty")
        );
        return;
      }
      setStep("preview");
    }
  }

  function goBack() {
    setError(null);
    setResultMsg(null);
    if (step === "pattern") setStep("range");
    else if (step === "preview") setStep("pattern");
  }

  function runGenerate() {
    setError(null);
    setResultMsg(null);
    if (!selectedUserIds.length) {
      setError(t(locale, "scheduleGenerateMembers"));
      return;
    }
    if (patternKind === "weekdays" && !templates.length) {
      setError(t(locale, "scheduleGenerateNeedTemplate"));
      return;
    }
    if (patternKind !== "weekdays" && !cycleHasWork(customCycle)) {
      setError(t(locale, "scheduleGeneratePatternEmpty"));
      return;
    }
    startTransition(async () => {
      const payload =
        patternKind === "weekdays"
          ? {
              spaceId,
              startKey,
              endKey,
              templateIds: templates.map((x) => x.id),
              userIds: selectedUserIds,
              pattern: "weekdays" as const,
              mode,
              conflict,
            }
          : {
              spaceId,
              startKey,
              endKey,
              templateIds: Array.from(
                new Set(
                  customCycle
                    .filter((b): b is Extract<PatternBlock, { kind: "work" }> =>
                      b.kind === "work"
                    )
                    .map((b) => b.template.id)
                )
              ),
              userIds: selectedUserIds,
              customCycle: serializePatternCycle(customCycle),
              mode,
              conflict,
            };
      const result = await generateShiftsBatchAction(payload);
      if ("error" in result) {
        setError(result.error || t(locale, "error"));
        return;
      }
      setWrittenCount(result.created);
      if (result.created === 0) {
        setResultMsg(t(locale, "scheduleGenerateEmpty"));
      } else {
        setResultMsg(
          t(locale, "scheduleGenerateDone").replace(
            "{n}",
            String(result.created)
          )
        );
      }
      if (result.batchId) rememberBatch(result.batchId);
      setStep("done");
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

  function runClear() {
    setError(null);
    setResultMsg(null);
    startTransition(async () => {
      const result = await clearGeneratedShiftsInRangeAction({
        spaceId,
        startKey,
        endKey,
        userIds: selectedUserIds.length
          ? selectedUserIds
          : isAdmin
            ? assignable.map((m) => m.user_id)
            : [currentUserId],
      });
      if ("error" in result) {
        setError(result.error || t(locale, "error"));
        setConfirmClear(false);
        return;
      }
      setResultMsg(
        t(locale, "scheduleGenerateClearDone").replace(
          "{n}",
          String(result.deleted ?? 0)
        )
      );
      setConfirmClear(false);
      router.refresh();
    });
  }

  const stepLabel =
    step === "range"
      ? t(locale, "scheduleGenerateStepRange")
      : step === "pattern"
        ? t(locale, "scheduleGenerateStepPattern")
        : step === "preview"
          ? t(locale, "scheduleGenerateStepPreview")
          : t(locale, "scheduleGenerateStepDone");

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
            <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-brand">
              {stepLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100"
          >
            {step === "done" ? t(locale, "close") : t(locale, "cancel")}
          </button>
        </div>

        {step === "range" ? (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-semibold text-slate-700">
                {t(locale, "scheduleGenerateStart")}
                <input
                  type="date"
                  value={startKey}
                  onChange={(e) => setStartKey(e.target.value)}
                  className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-700">
                {t(locale, "scheduleGenerateEnd")}
                <input
                  type="date"
                  value={endKey}
                  min={startKey}
                  onChange={(e) => setEndKey(e.target.value)}
                  className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-200"
                onClick={() => {
                  const r = defaultGenerateRangeKeys();
                  setStartKey(r.startKey);
                  setEndKey(r.endKey);
                }}
              >
                {t(locale, "scheduleGenerateRange28")}
              </button>
              <button
                type="button"
                className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-200"
                onClick={() => {
                  const r = monthRangeKeys(
                    cursorMonth.getFullYear(),
                    cursorMonth.getMonth()
                  );
                  setStartKey(r.startKey);
                  setEndKey(r.endKey);
                }}
              >
                {t(locale, "scheduleGenerateRangeMonth")}
              </button>
            </div>
            {rangeMeta.capped ? (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {t(locale, "scheduleGenerateCapped").replace(
                  "{n}",
                  String(rangeMeta.days.length)
                )}
              </p>
            ) : (
              <p className="text-[11px] text-slate-500">
                {t(locale, "scheduleGenerateDayCount").replace(
                  "{n}",
                  String(rangeMeta.days.length)
                )}
              </p>
            )}

            <div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-700">
                  {t(locale, "scheduleGenerateMembers")}
                </p>
                {isAdmin && assignable.length > 1 ? (
                  <div className="flex gap-2 text-[11px] font-semibold">
                    <button
                      type="button"
                      className="text-brand hover:underline"
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
                {(isAdmin
                  ? assignable
                  : assignable.filter((m) => m.user_id === currentUserId)
                ).map((m) => {
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
                })}
              </ul>
            </div>

            <label className="block text-xs font-semibold text-slate-700">
              {t(locale, "scheduleGenerateConflict")}
              <select
                value={conflict}
                onChange={(e) =>
                  setConflict(e.target.value as ConflictPolicy)
                }
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
          </div>
        ) : null}

        {step === "pattern" ? (
          <div className="mt-4 space-y-4">
            {templates.length === 0 ? (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {t(locale, "scheduleGenerateNeedTemplate")}
              </p>
            ) : null}

            <div>
              <p className="text-xs font-semibold text-slate-700">
                {t(locale, "scheduleGeneratePresets")}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(
                  [
                    "everyday",
                    "weekdays",
                    "4on4off",
                    "5on2off",
                  ] as GeneratePatternKind[]
                ).map((kind) => {
                  const label =
                    kind === "everyday"
                      ? t(locale, "scheduleGeneratePatternEveryday")
                      : kind === "weekdays"
                        ? t(locale, "scheduleGeneratePatternWeekdays")
                        : kind === "4on4off"
                          ? t(locale, "scheduleGeneratePattern4on4off")
                          : t(locale, "scheduleGeneratePattern5on2off");
                  const selected =
                    patternKind === "weekdays" && kind === "weekdays";
                  return (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => applyPreset(kind)}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${
                        selected
                          ? "bg-brand text-white ring-brand"
                          : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                {t(locale, "scheduleGeneratePresetsHint")}
              </p>
            </div>

            {patternKind === "weekdays" ? (
              <p className="rounded-2xl bg-slate-50 px-3 py-3 text-xs text-slate-700 ring-1 ring-slate-100">
                {t(locale, "scheduleGenerateWeekdaysNote")}
              </p>
            ) : (
              <>
                <div>
                  <p className="text-xs font-semibold text-slate-700">
                    {t(locale, "scheduleGeneratePattern")}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {t(locale, "scheduleGeneratePatternHint")}
                  </p>
                  {customCycle.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-500">
                      {t(locale, "scheduleGeneratePatternEmpty")}
                    </p>
                  ) : (
                    <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                      {customCycle.map((block, index) => (
                        <li
                          key={`${index}-${block.kind === "work" ? block.template.id : "rest"}`}
                          className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm hover:bg-slate-50"
                        >
                          <span className="w-6 shrink-0 text-xs font-bold text-slate-400">
                            {index + 1}
                          </span>
                          {block.kind === "rest" ? (
                            <span className="flex-1 font-medium text-slate-500">
                              {t(locale, "scheduleGenerateRest")}
                            </span>
                          ) : (
                            <>
                              <span
                                className="inline-block h-3 w-3 shrink-0 rounded-full"
                                style={{ background: block.template.color }}
                              />
                              <span className="min-w-0 flex-1 truncate font-medium text-slate-800">
                                {block.template.name}
                              </span>
                              <span className="shrink-0 text-[11px] text-slate-400">
                                {minutesLabel(
                                  block.template.default_start_minutes
                                )}
                                –
                                {minutesLabel(
                                  block.template.default_end_minutes
                                )}
                              </span>
                            </>
                          )}
                          <div className="flex shrink-0 gap-0.5">
                            <button
                              type="button"
                              disabled={index === 0}
                              onClick={() => moveBlock(index, -1)}
                              className="rounded px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-200 disabled:opacity-30"
                              aria-label="up"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              disabled={index === customCycle.length - 1}
                              onClick={() => moveBlock(index, 1)}
                              className="rounded px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-200 disabled:opacity-30"
                              aria-label="down"
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              onClick={() => removeBlock(index)}
                              className="rounded px-1.5 py-0.5 text-xs text-red-600 hover:bg-red-50"
                              aria-label="remove"
                            >
                              ×
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <p className="text-xs font-semibold text-slate-700">
                    {t(locale, "scheduleGeneratePalette")}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {templates.map((tmpl) => (
                      <button
                        key={tmpl.id}
                        type="button"
                        onClick={() => appendWork(tmpl)}
                        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50"
                      >
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ background: tmpl.color }}
                        />
                        + {tmpl.name}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={appendRest}
                      className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200"
                    >
                      + {t(locale, "scheduleGenerateRest")}
                    </button>
                  </div>
                </div>
              </>
            )}

            {selectedUserIds.length > 1 && patternKind !== "weekdays" ? (
              <label className="block text-xs font-semibold text-slate-700">
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
          </div>
        ) : null}

        {step === "preview" ? (
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl bg-slate-50 px-3 py-3 text-xs text-slate-700 ring-1 ring-slate-100">
              <p className="font-semibold">
                {t(locale, "scheduleGeneratePreview")}
              </p>
              <p className="mt-1">
                {startKey} → {endKey}
                {rangeMeta.capped
                  ? ` (${t(locale, "scheduleGenerateCappedShort").replace(
                      "{end}",
                      rangeMeta.days[rangeMeta.days.length - 1] ?? endKey
                    )})`
                  : ""}
              </p>
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
              {preview.capped ? (
                <p className="mt-1 text-amber-800">
                  {t(locale, "scheduleGenerateCapped").replace(
                    "{n}",
                    String(rangeMeta.days.length)
                  )}
                </p>
              ) : null}
            </div>

            {sampleDrafts.length > 0 ? (
              <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-slate-600">
                {sampleDrafts.map((d, i) => (
                  <li key={`${d.userId}-${d.dayKey}-${i}`} className="truncate">
                    {d.dayKey} ·{" "}
                    {memberLabel(
                      d.userId,
                      members,
                      profiles,
                      t(locale, "scheduleMemberFallback")
                    )}{" "}
                    · {d.title || "—"}
                    {d.overwrite
                      ? ` (${t(locale, "scheduleGenerateConflictOverwrite")})`
                      : ""}
                  </li>
                ))}
                {preview.drafts.length > sampleDrafts.length ? (
                  <li className="text-slate-400">
                    …
                  </li>
                ) : null}
              </ul>
            ) : null}
          </div>
        ) : null}

        {step === "done" ? (
          <div className="mt-4 space-y-3">
            <p className="text-center text-2xl font-bold text-emerald-700">
              {writtenCount > 0
                ? t(locale, "scheduleGenerateDone").replace(
                    "{n}",
                    String(writtenCount)
                  )
                : t(locale, "scheduleGenerateEmpty")}
            </p>
            {lastBatchId ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => setConfirmUndo(true)}
                className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {t(locale, "scheduleGenerateUndo")}
              </button>
            ) : null}

            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirmClear(true)}
              className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-60"
            >
              {t(locale, "scheduleGenerateClearRange")}
            </button>

            <button
              type="button"
              onClick={() => {
                setStep("range");
                setResultMsg(null);
                setError(null);
                setWrittenCount(0);
              }}
              className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-slate-100 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-200"
            >
              {t(locale, "scheduleGenerateAgain")}
            </button>
          </div>
        ) : null}

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

        {step !== "done" ? (
          <div className="mt-5 flex flex-wrap gap-2">
            {step === "pattern" || step === "preview" ? (
              <button
                type="button"
                disabled={pending}
                onClick={goBack}
                className="inline-flex h-10 items-center rounded-xl bg-white px-4 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-60"
              >
                {t(locale, "scheduleGenerateBack")}
              </button>
            ) : null}
            {step === "range" || step === "pattern" ? (
              <button
                type="button"
                disabled={pending}
                onClick={goNext}
                className="inline-flex h-10 flex-1 items-center justify-center rounded-xl bg-brand px-4 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-60"
              >
                {step === "pattern"
                  ? t(locale, "scheduleGeneratePreview")
                  : t(locale, "scheduleGenerateNext")}
              </button>
            ) : null}
            {step === "preview" ? (
              <button
                type="button"
                disabled={pending || preview.drafts.length === 0}
                onClick={runGenerate}
                className="inline-flex h-10 flex-1 items-center justify-center rounded-xl bg-brand px-4 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-60"
              >
                {pending
                  ? t(locale, "scheduleGenerateWorking")
                  : t(locale, "scheduleGenerateConfirm")}
              </button>
            ) : null}
          </div>
        ) : null}

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

        {confirmClear ? (
          <div className="mt-3 rounded-2xl bg-red-50 p-3 ring-1 ring-red-100">
            <p className="text-sm text-red-800">
              {t(locale, "scheduleGenerateClearRangeConfirm")}
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={runClear}
                className="inline-flex h-9 items-center rounded-xl bg-red-600 px-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {t(locale, "scheduleGenerateClearRange")}
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
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

