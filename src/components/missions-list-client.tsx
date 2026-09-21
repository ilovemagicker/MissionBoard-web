"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { statusLabel, t } from "@/lib/i18n";
import type { Locale, MissionRow } from "@/lib/types";

type Filter = "all" | "active" | "done";

export function MissionsListClient({
  missions,
  locale,
  stepCounts,
}: {
  missions: MissionRow[];
  locale: Locale;
  stepCounts: Record<string, { done: number; total: number }>;
}) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return missions.filter((m) => {
      if (filter === "done" && m.status !== "done") return false;
      if (filter === "active" && m.status === "done") return false;
      if (query && !m.title.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [missions, q, filter]);

  const counts = {
    all: missions.length,
    active: missions.filter((m) => m.status !== "done").length,
    done: missions.filter((m) => m.status === "done").length,
  };

  const chips: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: t(locale, "filterAll"), count: counts.all },
    { id: "active", label: t(locale, "filterActive"), count: counts.active },
    { id: "done", label: t(locale, "filterDone"), count: counts.done },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t(locale, "search")}
          className="h-10 min-w-[12rem] flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500"
        />
        <Link
          href="/app/missions/new"
          className="inline-flex h-10 items-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500"
        >
          {t(locale, "createMission")}
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setFilter(c.id)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              filter === c.id
                ? "bg-blue-600 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200"
            }`}
          >
            {c.label} ({c.count})
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-2xl bg-white p-6 text-sm text-slate-500 shadow-sm ring-1 ring-slate-200/80">
          {t(locale, "noMissions")}
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((m) => {
            const sc = stepCounts[m.id] ?? { done: 0, total: 0 };
            return (
              <li key={m.id}>
                <Link
                  href={`/app/missions/${m.id}`}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200/80 hover:ring-blue-200"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {m.title}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {m.due_date ? `Due ${m.due_date}` : "—"}
                      {sc.total > 0 ? ` · ${sc.done}/${sc.total}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                    {statusLabel(locale, m.status)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
