"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { activityKindLabel, t } from "@/lib/i18n";
import type { ActivityEventRow, Locale, ProfileRow } from "@/lib/types";

const SEEN_KEY_PREFIX = "mb_activity_seen_";

function seenKey(spaceId: string) {
  return `${SEEN_KEY_PREFIX}${spaceId}`;
}

function formatWhen(iso: string, locale: Locale): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(locale === "en" ? "en-US" : "zh-HK", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function ActivityClient({
  locale,
  spaceId,
  initialEvents,
  profiles: initialProfiles,
}: {
  locale: Locale;
  spaceId: string;
  initialEvents: ActivityEventRow[];
  profiles: Record<string, ProfileRow>;
}) {
  const [events, setEvents] = useState<ActivityEventRow[]>(initialEvents);
  const [profiles, setProfiles] = useState(initialProfiles);
  const [seenAt, setSeenAt] = useState<string | null>(null);

  useEffect(() => {
    setEvents(initialEvents);
    setProfiles(initialProfiles);
  }, [initialEvents, initialProfiles, spaceId]);

  useEffect(() => {
    try {
      setSeenAt(localStorage.getItem(seenKey(spaceId)));
    } catch {
      setSeenAt(null);
    }
  }, [spaceId]);

  const markSeen = useCallback(() => {
    const now = new Date().toISOString();
    try {
      localStorage.setItem(seenKey(spaceId), now);
    } catch {
      /* ignore */
    }
    setSeenAt(now);
  }, [spaceId]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`activity:${spaceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "activity_events",
          filter: `space_id=eq.${spaceId}`,
        },
        async (payload) => {
          const row = payload.new as ActivityEventRow;
          setEvents((prev) => {
            if (prev.some((e) => e.id === row.id)) return prev;
            return [row, ...prev];
          });
          if (!row.actor_id) return;
          const { data } = await supabase
            .from("profiles")
            .select("id,display_name,avatar_url")
            .eq("id", row.actor_id)
            .maybeSingle();
          if (data) {
            setProfiles((p) =>
              p[data.id as string] ? p : { ...p, [data.id as string]: data as ProfileRow }
            );
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [spaceId]);

  const cutoff = useMemo(() => Date.now() - 24 * 60 * 60 * 1000, []);

  const newest = useMemo(
    () => events.filter((e) => new Date(e.created_at).getTime() >= cutoff),
    [events, cutoff]
  );
  const earlier = useMemo(
    () => events.filter((e) => new Date(e.created_at).getTime() < cutoff),
    [events, cutoff]
  );

  function isUnread(e: ActivityEventRow): boolean {
    if (!seenAt) return true;
    return new Date(e.created_at).getTime() > new Date(seenAt).getTime();
  }

  function renderList(rows: ActivityEventRow[]) {
    if (rows.length === 0) return null;
    return (
      <ul className="space-y-2">
        {rows.map((e) => {
          const unread = isUnread(e);
          const actor =
            (e.actor_id && profiles[e.actor_id]?.display_name) ||
            (e.actor_id ? e.actor_id.slice(0, 8) : "—");
          const inner = (
            <div
              className={`flex items-start justify-between gap-3 rounded-2xl px-4 py-3 shadow-sm ring-1 ${
                unread
                  ? "bg-blue-50/70 ring-blue-200"
                  : "bg-white ring-slate-200/80"
              }`}
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {activityKindLabel(locale, e.kind)}
                  {unread && (
                    <span className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-blue-600 align-middle" />
                  )}
                </p>
                <p className="mt-0.5 truncate text-sm font-medium text-slate-900">
                  {e.summary || "—"}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {actor} · {formatWhen(e.created_at, locale)}
                </p>
              </div>
            </div>
          );
          return (
            <li key={e.id}>
              {e.mission_id ? (
                <Link href={`/app/missions/${e.mission_id}`} className="block hover:opacity-90">
                  {inner}
                </Link>
              ) : (
                inner
              )}
            </li>
          );
        })}
      </ul>
    );
  }

  if (events.length === 0) {
    return (
      <p className="rounded-2xl bg-white p-6 text-sm text-slate-500 shadow-sm ring-1 ring-slate-200/80">
        {t(locale, "activityEmpty")}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={markSeen}
          className="rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
        >
          {t(locale, "activityMarkSeen")}
        </button>
      </div>

      {newest.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {t(locale, "activityNewest")}
          </h2>
          {renderList(newest)}
        </section>
      )}

      {earlier.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {t(locale, "activityEarlier")}
          </h2>
          {renderList(earlier)}
        </section>
      )}
    </div>
  );
}
