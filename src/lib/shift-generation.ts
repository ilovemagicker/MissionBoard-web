import { appliedRangeOnDay } from "@/lib/shift-templates";
import { toDateKey } from "@/lib/calendar";
import type { ShiftTemplateRow } from "@/lib/types";

export type GeneratePatternKind =
  | "everyday"
  | "weekdays"
  | "4on4off"
  | "5on2off";

export type GenerateMode = "samePhase" | "staggered";
export type ConflictPolicy = "skip" | "overwrite";

export type PatternBlock =
  | { kind: "work"; template: ShiftTemplateRow }
  | { kind: "rest" };

export type GenerateDraft = {
  userId: string;
  dayKey: string;
  startAt: string;
  endAt: string;
  title: string | null;
  color: string;
  textColor: string;
  templateId: string | null;
  /** True when an existing shift on that day will be removed first. */
  overwrite: boolean;
};

export type GeneratePlan = {
  drafts: GenerateDraft[];
  skipped: number;
  restDays: number;
  overwriteCount: number;
};

export const MAX_GENERATE_DAYS = 400;

/** Build a repeating cycle (null = rest). Weekdays is calendar-based, not a cycle. */
export function buildPatternCycle(
  kind: GeneratePatternKind,
  templates: ShiftTemplateRow[]
): PatternBlock[] | null {
  if (templates.length === 0) return null;
  if (kind === "weekdays") return null;

  const work = (i: number): PatternBlock => ({
    kind: "work",
    template: templates[i % templates.length],
  });
  const rest = (): PatternBlock => ({ kind: "rest" });

  if (kind === "everyday") {
    return templates.map((_, i) => work(i));
  }
  if (kind === "4on4off") {
    return [
      work(0),
      work(1),
      work(2),
      work(3),
      rest(),
      rest(),
      rest(),
      rest(),
    ];
  }
  // 5on2off
  return [work(0), work(1), work(2), work(3), work(4), rest(), rest()];
}

/** Inclusive local YYYY-MM-DD range → day keys (capped). */
export function enumerateDayKeys(
  startKey: string,
  endKey: string,
  maxDays = MAX_GENERATE_DAYS
): { days: string[]; capped: boolean } {
  const [ys, ms, ds] = startKey.split("-").map(Number);
  const [ye, me, de] = endKey.split("-").map(Number);
  let cur = new Date(ys, ms - 1, ds);
  const end = new Date(ye, me - 1, de);
  if (end < cur) {
    return { days: [startKey], capped: false };
  }
  const days: string[] = [];
  let capped = false;
  while (cur <= end) {
    if (days.length >= maxDays) {
      capped = true;
      break;
    }
    days.push(toDateKey(cur));
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
  }
  return { days, capped };
}

/** First/last day keys for a local month (month is 0-based Date or YYYY-MM). */
export function monthRangeKeys(year: number, monthIndex0: number): {
  startKey: string;
  endKey: string;
} {
  const start = new Date(year, monthIndex0, 1);
  const end = new Date(year, monthIndex0 + 1, 0);
  return { startKey: toDateKey(start), endKey: toDateKey(end) };
}

function isWeekend(dayKey: string): boolean {
  const [y, m, d] = dayKey.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay(); // 0 Sun … 6 Sat
  return dow === 0 || dow === 6;
}

/**
 * Plan shifts for a date range. `occupiedDayKeys` maps `${userId}|${dayKey}` → true
 * when the assignee already has a scheduled shift that day.
 */
export function planGeneration(input: {
  templates: ShiftTemplateRow[];
  userIds: string[];
  startKey: string;
  endKey: string;
  pattern: GeneratePatternKind;
  mode: GenerateMode;
  conflict: ConflictPolicy;
  occupiedDayKeys: Set<string>;
}): GeneratePlan & { capped: boolean } {
  const { days, capped } = enumerateDayKeys(input.startKey, input.endKey);
  const cycle = buildPatternCycle(input.pattern, input.templates);
  const cycleLen = cycle?.length ?? 1;
  const staggerStep = Math.max(
    1,
    Math.floor(cycleLen / Math.max(1, input.userIds.length))
  );

  const drafts: GenerateDraft[] = [];
  let skipped = 0;
  let restDays = 0;
  let overwriteCount = 0;

  for (let dayIndex = 0; dayIndex < days.length; dayIndex++) {
    const dayKey = days[dayIndex];
    for (let memberIndex = 0; memberIndex < input.userIds.length; memberIndex++) {
      const userId = input.userIds[memberIndex];
      let block: PatternBlock | null;

      if (input.pattern === "weekdays") {
        if (isWeekend(dayKey) || input.templates.length === 0) {
          block = { kind: "rest" };
        } else {
          const t =
            input.templates[dayIndex % input.templates.length];
          block = { kind: "work", template: t };
        }
      } else if (cycle) {
        const offset =
          input.mode === "staggered" ? memberIndex * staggerStep : 0;
        block = cycle[(dayIndex + offset) % cycleLen];
      } else {
        block = { kind: "rest" };
      }

      if (!block || block.kind === "rest") {
        restDays += 1;
        continue;
      }

      const occKey = `${userId}|${dayKey}`;
      const occupied = input.occupiedDayKeys.has(occKey);
      if (occupied && input.conflict === "skip") {
        skipped += 1;
        continue;
      }

      const tmpl = block.template;
      const { start, end } = appliedRangeOnDay(
        dayKey,
        tmpl.default_start_minutes,
        tmpl.default_end_minutes
      );
      if (occupied && input.conflict === "overwrite") {
        overwriteCount += 1;
      }
      drafts.push({
        userId,
        dayKey,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        title: tmpl.name?.trim() || null,
        color: tmpl.color || "#3B82F6",
        textColor: tmpl.text_color || "#FFFFFF",
        templateId: tmpl.id,
        overwrite: occupied && input.conflict === "overwrite",
      });
    }
  }

  return { drafts, skipped, restDays, overwriteCount, capped };
}

export function lastBatchStorageKey(spaceId: string) {
  return `missionBoard.lastGenerationBatchId.${spaceId}`;
}
