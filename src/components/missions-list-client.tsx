"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SpaceAnnouncementsBoard } from "@/components/space-announcements-board";
import { MissionFlagIconView } from "@/components/flag-icon";
import { statusLabel, t } from "@/lib/i18n";
import type {
  Locale,
  MissionAnnouncementRow,
  MissionPriority,
  MissionRow,
  ProfileRow,
  SpaceRole,
} from "@/lib/types";

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
  return "—";
}

function isAwaitingDecision(m: MissionRow): boolean {
  return (
    !!m.decision_maker_id &&
    !m.decision_approved_at &&
    !!m.decision_requested_at
  );
}

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDue(due: string | null): {
  text: string;
  overdue: boolean;
  dueToday: boolean;
} {
  if (!due) return { text: "—", overdue: false, dueToday: false };
  const today = todayKey();
  const overdue = due < today;
  const dueToday = due === today;
  return { text: due, overdue, dueToday };
}

export function MissionsListClient({
  missions: initialMissions,
  locale,
  stepCounts,
  showArchived,
  spaceId,
  myRole,
  spaceAnnouncementsEnabled = false,
  spaceAnnouncements = [],
  spaceDismissedIds = [],
  spaceReadByMe = [],
  spaceAnnouncementReadCounts = {},
  announcementProfiles = {},
}: {
  missions: MissionRow[];
  locale: Locale;
  stepCounts: Record<string, { done: number; total: number }>;
  showArchived: boolean;
  spaceId: string;
  myRole: SpaceRole | null;
  spaceAnnouncementsEnabled?: boolean;
  spaceAnnouncements?: MissionAnnouncementRow[];
  spaceDismissedIds?: string[];
  spaceReadByMe?: string[];
  spaceAnnouncementReadCounts?: Record<string, number>;
  announcementProfiles?: Record<string, ProfileRow>;
}) {
  const router = useRouter();
  const [missions, setMissions] = useState(initialMissions);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("active");
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

  const summary = useMemo(() => {
    const today = todayKey();
    const open = missions.filter((m) => m.status !== "done" && !m.archived_at);
    const dueToday = open.filter((m) => m.due_date === today).length;
    const overdue = open.filter((m) => m.due_date && m.due_date < today).length;
    return { dueToday, overdue };
  }, [missions]);

  const counts = {
    all: missions.length,
    active: missions.filter((m) => m.status !== "done").length,
    done: missions.filter((m) => m.status === "done").length,
    awaitingDecision: missions.filter(isAwaitingDecision).length,
  };

  const chips: { id: Filter; label: string; count: number }[] = [
    { id: "active", label: t(locale, "filterActive"), count: counts.active },
    { id: "all", label: t(locale, "filterAll"), count: counts.all },
    { id: "done", label: t(locale, "filterDone"), count: counts.done },
    {
      id: "awaitingDecision",
      label: t(locale, "filterAwaitingDecision"),
      count: counts.awaitingDecision,
    },
  ];

  function toggleArchived() {
    const url = showArchived ? "/app/missions" : "/app/missions?archived=1";
    router.push(url);
  }

  const canPostSpaceAnnouncement =
    myRole === "owner" || myRole === "admin";

  return (
    <div className="space-y-3">
      <SpaceAnnouncementsBoard
        locale={locale}
        spaceId={spaceId}
        announcements={spaceAnnouncements}
        dismissedIds={spaceDismissedIds}
        readByMe={spaceReadByMe}
        readCounts={spaceAnnouncementReadCounts}
        profiles={announcementProfiles}
        canPost={canPostSpaceAnnouncement}
        enabled={spaceAnnouncementsEnabled}
      />

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold tracking-tight text-slate-900">
          {t(locale, "missions")}
        </h1>
        <Link
          href="/app/missions/calendar"
          className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          {t(locale, "calendar")}
        </Link>
        <Link
          href="/app/missions/new"
          className="inline-flex h-9 items-center rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-brand/90"
        >
          {t(locale, "createMission")}
        </Link>
      </div>

      {(summary.dueToday > 0 || summary.overdue > 0) && (
        <p className="text-xs text-slate-500">
          {summary.dueToday > 0 && (
            <span>
              {t(locale, "today")} {summary.dueToday}
            </span>
          )}
          {summary.dueToday > 0 && summary.overdue > 0 && (
            <span className="mx-1.5 text-slate-300">·</span>
          )}
          {summary.overdue > 0 && (
            <span className="font-medium text-red-600">
              {t(locale, "overdue")} {summary.overdue}
            </span>
          )}
        </p>
      )}

      {/* Single toolbar: search + status + priority + archived */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t(locale, "search")}
          className="h-8 min-w-[10rem] flex-1 rounded-md border border-slate-200 bg-white px-2.5 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand/30 sm:max-w-xs"
        />
        <div
          role="tablist"
          aria-label={t(locale, "missions")}
          className="inline-flex flex-wrap items-center gap-0.5 rounded-md border border-slate-200 bg-slate-50 p-0.5"
        >
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={filter === c.id}
              onClick={() => setFilter(c.id)}
              className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
                filter === c.id
                  ? "bg-white text-brand shadow-sm ring-1 ring-slate-200/80"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {c.label}
              <span className="ml-1 tabular-nums text-slate-400">{c.count}</span>
            </button>
          ))}
        </div>
        <label className="inline-flex h-8 items-center gap-1.5 text-xs text-slate-500">
          <span className="sr-only sm:not-sr-only">{t(locale, "priority")}</span>
          <select
            value={priorityFilter}
            onChange={(e) =>
              setPriorityFilter(e.target.value as PriorityFilter)
            }
            className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:border-brand focus:ring-1 focus:ring-brand/30"
          >
            <option value="all">{t(locale, "priorityFilterAll")}</option>
            <option value="high">{t(locale, "priorityHigh")}</option>
            <option value="medium">{t(locale, "priorityMedium")}</option>
            <option value="low">{t(locale, "priorityLow")}</option>
          </select>
        </label>
        <button
          type="button"
          onClick={toggleArchived}
          className={`inline-flex h-8 items-center rounded-md px-2.5 text-xs font-semibold ${
            showArchived
              ? "bg-amber-600 text-white"
              : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          {showArchived ? t(locale, "hideArchived") : t(locale, "showArchived")}
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-10 text-center">
          <p className="text-sm text-slate-500">{t(locale, "noMissions")}</p>
          <Link
            href="/app/missions/new"
            className="mt-3 inline-flex h-9 items-center rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-brand/90"
          >
            {t(locale, "createMission")}
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-[640px] w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 font-semibold">{t(locale, "title")}</th>
                <th className="w-28 px-3 py-2 font-semibold">{t(locale, "dueDate")}</th>
                <th className="w-20 px-3 py-2 font-semibold">{t(locale, "steps")}</th>
                <th className="w-24 px-3 py-2 font-semibold">{t(locale, "priority")}</th>
                <th className="w-28 px-3 py-2 font-semibold">
                  {t(locale, "statusColumn")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((m) => {
                const sc = stepCounts[m.id] ?? { done: 0, total: 0 };
                const archived = !!m.archived_at;
                const awaiting = isAwaitingDecision(m);
                const due = formatDue(m.due_date);
                return (
                  <tr
                    key={m.id}
                    className="group hover:bg-brand/[0.04]"
                  >
                    <td className="px-3 py-0">
                      <Link
                        href={`/app/missions/${m.id}`}
                        className="flex min-h-[42px] items-center gap-2.5 py-1.5"
                      >
                        <MissionFlagIconView
                          flagIcon={m.flag_icon}
                          size={24}
                        />
                        <span className="min-w-0 truncate text-[13px] font-medium text-slate-900">
                          {m.title}
                          {archived && (
                            <span className="ml-1.5 inline-block rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200">
                              {t(locale, "archived")}
                            </span>
                          )}
                          {awaiting && (
                            <span className="ml-1.5 inline-block rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 ring-1 ring-violet-200">
                              {t(locale, "decisionPendingBadge")}
                            </span>
                          )}
                          {m.recurrence_id && (
                            <span
                              title={t(locale, "recurrenceIconA11y")}
                              className="ml-1.5 inline-block rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 ring-1 ring-indigo-200"
                            >
                              ↻
                            </span>
                          )}
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-0">
                      <Link
                        href={`/app/missions/${m.id}`}
                        className={`flex min-h-[42px] items-center text-[13px] tabular-nums ${
                          due.overdue
                            ? "font-semibold text-red-600"
                            : due.dueToday
                              ? "font-medium text-amber-700"
                              : "text-slate-600"
                        }`}
                      >
                        {due.text}
                      </Link>
                    </td>
                    <td className="px-3 py-0">
                      <Link
                        href={`/app/missions/${m.id}`}
                        className="flex min-h-[42px] items-center text-[13px] tabular-nums text-slate-600"
                      >
                        {sc.total > 0 ? `${sc.done}/${sc.total}` : "—"}
                      </Link>
                    </td>
                    <td className="px-3 py-0">
                      <Link
                        href={`/app/missions/${m.id}`}
                        className="flex min-h-[42px] items-center"
                      >
                        {m.priority ? (
                          <span
                            className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ring-1 ${priorityBadgeClass(
                              m.priority
                            )}`}
                          >
                            {priorityLabel(locale, m.priority)}
                          </span>
                        ) : (
                          <span className="text-[13px] text-slate-400">—</span>
                        )}
                      </Link>
                    </td>
                    <td className="px-3 py-0">
                      <Link
                        href={`/app/missions/${m.id}`}
                        className="flex min-h-[42px] items-center"
                      >
                        <span className="rounded bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200">
                          {statusLabel(locale, m.status)}
                        </span>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
