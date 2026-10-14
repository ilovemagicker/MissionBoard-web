"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { statusLabel, t } from "@/lib/i18n";
import type { Locale, MissionPriority, MissionRow } from "@/lib/types";

type Filter = "all" | "active" | "done" | "awaitingDecision";
type PriorityFilter = "all" | MissionPriority;

function priorityBadgeClass(p: MissionPriority | null | undefined): string {
  if (p === "high") return "bg-red-50 text-red-700 ring-red-200";
  if (p === "medium") return "bg-amber-50 text-amber-800 ring-amber-200";
  if (p === "low") return "bg-slate-50 text-slate-600 ring-slate-200";
  return "bg-slate-50 text-slate-400 ring-slate-200";
}

function priorityLabel(locale: Locale, p: MissionPriority | null | undefined): string {
  if (p === "high") return t(locale, "priorityHigh");
  if (p === "medium") return t(locale, "priorityMedium");
  if (p === "low") return t(locale, "priorityLow");
  return t(locale, "priorityNone");
}

function isAwaitingDecision(m: MissionRow): boolean {
  return (
    !!m.decision_maker_id &&
    !m.decision_approved_at &&
    !!m.decision_requested_at
  );
}

export function MissionsListClient({
  missions: initialMissions,
  locale,
  stepCounts,
  showArchived,
  spaceId,
}: {
  missions: MissionRow[];
  locale: Locale;
  stepCounts: Record<string, { done: number; total: number }>;
  showArchived: boolean;
  spaceId: string;
}) {
  const router = useRouter();
  const [missions, setMissions] = useState(initialMissions);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");

  useEffect(() => {
    setMissions(initialMissions);
  }, [initialMissions]);

  useEffect(() => {
    if (!spaceId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`missions:${spaceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "missions",
          filter: `space_id=eq.${spaceId}`,
        },
        () => {
          router.refresh();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [spaceId, router]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return missions.filter((m) => {
      if (filter === "done" && m.status !== "done") return false;
      if (filter === "active" && m.status === "done") return false;
      if (filter === "awaitingDecision" && !isAwaitingDecision(m)) return false;
      if (priorityFilter !== "all" && m.priority !== priorityFilter) return false;
      if (query && !m.title.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [missions, q, filter, priorityFilter]);

  const counts = {
    all: missions.length,
    active: missions.filter((m) => m.status !== "done").length,
    done: missions.filter((m) => m.status === "done").length,
    awaitingDecision: missions.filter(isAwaitingDecision).length,
  };

  const chips: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: t(locale, "filterAll"), count: counts.all },
    { id: "active", label: t(locale, "filterActive"), count: counts.active },
    { id: "done", label: t(locale, "filterDone"), count: counts.done },
    {
      id: "awaitingDecision",
      label: t(locale, "filterAwaitingDecision"),
      count: counts.awaitingDecision,
    },
  ];

  const priorityChips: { id: PriorityFilter; label: string }[] = [
    { id: "all", label: t(locale, "priorityFilterAll") },
    { id: "high", label: t(locale, "priorityHigh") },
    { id: "medium", label: t(locale, "priorityMedium") },
    { id: "low", label: t(locale, "priorityLow") },
  ];

  function toggleArchived() {
    const url = showArchived ? "/app/missions" : "/app/missions?archived=1";
    router.push(url);
  }

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

      <div className="flex flex-wrap items-center gap-2">
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
        <button
          type="button"
          onClick={toggleArchived}
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            showArchived
              ? "bg-amber-600 text-white"
              : "bg-white text-slate-600 ring-1 ring-slate-200"
          }`}
        >
          {showArchived ? t(locale, "hideArchived") : t(locale, "showArchived")}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          {t(locale, "priority")}
        </span>
        {priorityChips.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setPriorityFilter(c.id)}
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
              priorityFilter === c.id
                ? "bg-slate-800 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200"
            }`}
          >
            {c.label}
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
            const archived = !!m.archived_at;
            const awaiting = isAwaitingDecision(m);
            return (
              <li key={m.id}>
                <Link
                  href={`/app/missions/${m.id}`}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200/80 hover:ring-blue-200"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {m.title}
                      {archived && (
                        <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200">
                          {t(locale, "archived")}
                        </span>
                      )}
                      {awaiting && (
                        <span className="ml-2 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700 ring-1 ring-violet-200">
                          {t(locale, "decisionPendingBadge")}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {m.due_date ? `Due ${m.due_date}` : "—"}
                      {sc.total > 0 ? ` · ${sc.done}/${sc.total}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {m.priority && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${priorityBadgeClass(
                          m.priority
                        )}`}
                      >
                        {priorityLabel(locale, m.priority)}
                      </span>
                    )}
                    <span className="rounded-full bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                      {statusLabel(locale, m.status)}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
