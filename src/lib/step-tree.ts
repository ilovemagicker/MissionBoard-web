import type { MissionStepRow } from "@/lib/types";

/** App-side nest cap (server allows 12). Root = depth 0. */
export const STEP_TREE_MAX_DEPTH = 4; // maxLevels 5 including root → depth 0..4

export type StepTreeRow = {
  step: MissionStepRow;
  depth: number;
  childCount: number;
  childDoneCount: number;
  siblingIndex: number;
  siblingCount: number;
};

function resolvedParentId(
  step: MissionStepRow,
  ids: Set<string>
): string | null {
  const pid = step.parent_step_id ?? null;
  if (!pid || pid === step.id || !ids.has(pid)) return null;
  return pid;
}

export function childrenIndex(
  steps: MissionStepRow[]
): Map<string | null, MissionStepRow[]> {
  const ids = new Set(steps.map((s) => s.id));
  const index = new Map<string | null, MissionStepRow[]>();
  for (const step of steps) {
    const parent = resolvedParentId(step, ids);
    const list = index.get(parent) ?? [];
    list.push(step);
    index.set(parent, list);
  }
  for (const [key, list] of index) {
    list.sort((a, b) => {
      if (a.order_index !== b.order_index) return a.order_index - b.order_index;
      return a.created_at.localeCompare(b.created_at);
    });
    index.set(key, list);
  }
  return index;
}

/** Depth-first tree order for display. */
export function flattenStepTree(steps: MissionStepRow[]): StepTreeRow[] {
  const index = childrenIndex(steps);
  const rows: StepTreeRow[] = [];

  function walk(parentId: string | null, depth: number) {
    const children = index.get(parentId) ?? [];
    children.forEach((step, i) => {
      const kids = index.get(step.id) ?? [];
      rows.push({
        step,
        depth,
        childCount: kids.length,
        childDoneCount: kids.filter((c) => c.is_done).length,
        siblingIndex: i,
        siblingCount: children.length,
      });
      if (depth < 12) walk(step.id, depth + 1);
    });
  }

  walk(null, 0);
  return rows;
}

export function previousSiblingId(
  steps: MissionStepRow[],
  stepId: string
): string | null {
  const ids = new Set(steps.map((s) => s.id));
  const step = steps.find((s) => s.id === stepId);
  if (!step) return null;
  const parent = resolvedParentId(step, ids);
  const siblings = childrenIndex(steps).get(parent) ?? [];
  const idx = siblings.findIndex((s) => s.id === stepId);
  if (idx <= 0) return null;
  return siblings[idx - 1].id;
}

export function canIndentStep(steps: MissionStepRow[], stepId: string): boolean {
  const prev = previousSiblingId(steps, stepId);
  if (!prev) return false;
  const rows = flattenStepTree(steps);
  const prevRow = rows.find((r) => r.step.id === prev);
  if (!prevRow) return false;
  // Moving under previous sibling increases depth by 1 relative to current.
  const stepRow = rows.find((r) => r.step.id === stepId);
  if (!stepRow) return false;
  // New depth of step = prevRow.depth + 1; subtree must fit.
  const subtreeHeight = measureSubtreeHeight(steps, stepId);
  return prevRow.depth + 1 + subtreeHeight <= STEP_TREE_MAX_DEPTH;
}

function measureSubtreeHeight(steps: MissionStepRow[], rootId: string): number {
  const index = childrenIndex(steps);
  function h(id: string): number {
    const kids = index.get(id) ?? [];
    if (kids.length === 0) return 0;
    return 1 + Math.max(...kids.map((k) => h(k.id)));
  }
  return h(rootId);
}

export function canOutdentStep(steps: MissionStepRow[], stepId: string): boolean {
  const ids = new Set(steps.map((s) => s.id));
  const step = steps.find((s) => s.id === stepId);
  if (!step) return false;
  return resolvedParentId(step, ids) != null;
}

export function outdentTarget(
  steps: MissionStepRow[],
  stepId: string
): { parentId: string | null; afterSiblingId: string } | null {
  const ids = new Set(steps.map((s) => s.id));
  const step = steps.find((s) => s.id === stepId);
  if (!step) return null;
  const parentId = resolvedParentId(step, ids);
  if (!parentId) return null;
  const parent = steps.find((s) => s.id === parentId);
  if (!parent) return null;
  const grand = resolvedParentId(parent, ids);
  return { parentId: grand, afterSiblingId: parentId };
}

export function leafStepCounts(
  steps: { mission_id: string; is_done: boolean; parent_step_id?: string | null; id?: string }[]
): Record<string, { done: number; total: number }> {
  // If no parent_step_id column data, treat all as leaves.
  const byMission = new Map<string, typeof steps>();
  for (const s of steps) {
    const list = byMission.get(s.mission_id) ?? [];
    list.push(s);
    byMission.set(s.mission_id, list);
  }
  const out: Record<string, { done: number; total: number }> = {};
  for (const [mid, list] of byMission) {
    const parentIds = new Set(
      list
        .map((s) => s.parent_step_id)
        .filter((p): p is string => !!p)
    );
    const leaves = list.filter((s) => !s.id || !parentIds.has(s.id));
    // When id missing (list page select without id), fall back to all rows.
    const use = list.some((s) => s.id) ? leaves : list;
    out[mid] = {
      total: use.length,
      done: use.filter((s) => s.is_done).length,
    };
  }
  return out;
}
