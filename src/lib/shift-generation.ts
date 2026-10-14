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

/** In-memory block (client preview / planGeneration). */
export type PatternBlock =
  | { kind: "work"; template: ShiftTemplateRow }
  | { kind: "rest" };

/**
 * Wire format for custom cycles (server action). Template rows are
 * rehydrated from DB by id — never trust client-supplied template fields.
 */
export type PatternBlockInput =
  | { kind: "work"; templateId: string }
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

/** Build a repeating cycle (null = rest / weekdays calendar mode). */
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

/**
 * Seed a custom cycle from a preset using one primary template for work
 * days (matches iOS fillFourOnFourOff / fillFiveOnTwoOff when a single
 * palette slot is used). For everyday / multi-template presets, cycles
 * through the full template list.
 */
export function seedCustomCycle(
  kind: Exclude<GeneratePatternKind, "weekdays">,
  templates: ShiftTemplateRow[]
): PatternBlock[] {
  if (templates.length === 0) return [];
  const primary = templates[0];
  const workPrimary = (): PatternBlock => ({ kind: "work", template: primary });
  const rest = (): PatternBlock => ({ kind: "rest" });

  if (kind === "everyday") {
    return templates.map((tmpl) => ({ kind: "work" as const, template: tmpl }));
  }
  if (kind === "4on4off") {
    return [
      workPrimary(),
      workPrimary(),
      workPrimary(),
      workPrimary(),
      rest(),
      rest(),
      rest(),
      rest(),
    ];
  }
  // 5on2off — iOS uses first template for all work days
  return [
    workPrimary(),
    workPrimary(),
    workPrimary(),
    workPrimary(),
    workPrimary(),
    rest(),
    rest(),
  ];
}

/** Serialize PatternBlock[] for the server action. */
export function serializePatternCycle(
  cycle: PatternBlock[]
): PatternBlockInput[] {
  return cycle.map((b) =>
    b.kind === "rest"
      ? { kind: "rest" }
      : { kind: "work", templateId: b.template.id }
  );
}

/** Rehydrate wire blocks using a template id → row map. */
export function hydratePatternCycle(
  inputs: PatternBlockInput[],
  byId: Map<string, ShiftTemplateRow>
): PatternBlock[] | null {
  const out: PatternBlock[] = [];
  for (const b of inputs) {
    if (b.kind === "rest") {
      out.push({ kind: "rest" });
      continue;
    }
    const tmpl = byId.get(b.templateId);
    if (!tmpl) return null;
    out.push({ kind: "work", template: tmpl });
  }
  return out;
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

/** Default wizard range: today … today+27 (matches iOS). */
export function defaultGenerateRangeKeys(from = new Date()): {
  startKey: string;
  endKey: string;
} {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate() + 27
  );
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
 *
 * Prefer `customCycle` when building a user-edited pattern. Pass
 * `pattern: "weekdays"` for calendar weekend = rest (not expressible as a
 * fixed cycle). Legacy preset kinds still work via `buildPatternCycle`.
 */
export function planGeneration(input: {
  templates: ShiftTemplateRow[];
  userIds: string[];
  startKey: string;
  endKey: string;
  pattern?: GeneratePatternKind;
  /** When set (and pattern is not weekdays), drives the repeating cycle. */
  customCycle?: PatternBlock[];
  mode: GenerateMode;
  conflict: ConflictPolicy;
  occupiedDayKeys: Set<string>;
}): GeneratePlan & { capped: boolean } {
  const { days, capped } = enumerateDayKeys(input.startKey, input.endKey);
  const useWeekdays = input.pattern === "weekdays";

  let cycle: PatternBlock[] | null = null;
  if (!useWeekdays) {
    if (input.customCycle && input.customCycle.length > 0) {
      cycle = input.customCycle;
    } else if (input.pattern) {
      cycle = buildPatternCycle(input.pattern, input.templates);
    }
  }

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

      if (useWeekdays) {
        if (isWeekend(dayKey) || input.templates.length === 0) {
          block = { kind: "rest" };
        } else {
          const t = input.templates[dayIndex % input.templates.length];
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

/** Unique template ids referenced by a serialized custom cycle. */
export function templateIdsFromCycle(cycle: PatternBlockInput[]): string[] {
  const ids: string[] = [];
  for (const b of cycle) {
    if (b.kind === "work" && !ids.includes(b.templateId)) {
      ids.push(b.templateId);
    }
  }
  return ids;
}

export function cycleHasWork(cycle: PatternBlock[]): boolean {
  return cycle.some((b) => b.kind === "work");
}
