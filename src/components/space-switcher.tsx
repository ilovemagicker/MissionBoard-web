"use client";

import { setActiveSpaceAction } from "@/app/actions/prefs";
import type { SpaceWithRole } from "@/lib/types";

export function SpaceSwitcher({
  spaces,
  activeSpaceId,
  label,
}: {
  spaces: SpaceWithRole[];
  activeSpaceId: string | null;
  label: string;
}) {
  if (spaces.length === 0) {
    return <span className="text-sm text-slate-500">{label}</span>;
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="hidden text-slate-500 sm:inline">{label}</span>
      <select
        className="max-w-[12rem] rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 outline-none focus:border-blue-500"
        value={activeSpaceId ?? spaces[0].id}
        onChange={(e) => setActiveSpaceAction(e.target.value)}
      >
        {spaces.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}
