"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { activityKindLabel, dateLocale, t } from "@/lib/i18n";
import type { ActivityEventRow, Locale, ProfileRow } from "@/lib/types";

const SEEN_KEY_PREFIX = "mb_activity_seen_";
import { ACTIVITY_UNREAD_PREFIX } from "@/lib/activity-unread";

function seenKey(spaceId: string) {
  return `${SEEN_KEY_PREFIX}${spaceId}`;
}

function unreadKey(spaceId: string) {
  return `${ACTIVITY_UNREAD_PREFIX}${spaceId}`;
}

function formatWhen(iso: string, locale: Locale): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(dateLocale(locale), {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function writeUnreadFlag(spaceId: string, hasUnread: boolean) {
  try {
    if (hasUnread) localStorage.setItem(unreadKey(spaceId), "1");
    else localStorage.removeItem(unreadKey(spaceId));
    window.dispatchEvent(
      new CustomEvent("mb-activity-unread", {
        detail: { spaceId, hasUnread },
      })
    );
  } catch {
    /* ignore */
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

  function isUnread(e: ActivityEventRow): boolean {
    if (!seenAt) return true;
    return new Date(e.created_at).getTime() > new Date(seenAt).getTime();
  }

  const unreadCount = useMemo(
    () => events.filter(isUnread).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, seenAt]
  );

  useEffect(() => {
    writeUnreadFlag(spaceId, unreadCount > 0);
  }, [spaceId, unreadCount]);

  const markSeen = useCallback(() => {
    const now = new Date().toISOString();
    try {
      localStorage.setItem(seenKey(spaceId), now);
    } catch {
      /* ignore */
    }
    setSeenAt(now);
    writeUnreadFlag(spaceId, false);
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
              p[data.id as string]
                ? p
                : { ...p, [data.id as string]: data as ProfileRow }
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

  function renderList(rows: ActivityEventRow[]) {
    if (rows.length === 0) return null;
    return (
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {rows.map((e) => {
          const unread = isUnread(e);
          const actor =
            (e.actor_id && profiles[e.actor_id]?.display_name) ||
            (e.actor_id ? e.actor_id.slice(0, 8) : "—");
          const inner = (
            <div
              className={`flex min-h-[44px] items-start gap-2.5 px-3 py-2.5 ${
                unread ? "bg-brand/[0.04]" : ""
              }`}
            >
              <span
                className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                  unread ? "bg-brand" : "bg-transparent"
                }`}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    {activityKindLabel(locale, e.kind)}
                  </p>
                  <p className="text-[11px] tabular-nums text-slate-400">
                    {formatWhen(e.created_at, locale)}
                  </p>
                </div>
                <p className="truncate text-[13px] font-medium text-slate-900">
                  {e.summary || "—"}
                </p>
                <p className="text-xs text-slate-500">{actor}</p>
              </div>
            </div>
          );
          return (
            <li key={e.id}>
              {e.mission_id ? (
                <Link
                  href={`/app/missions/${e.mission_id}`}
                  className="block hover:bg-slate-50"
                >
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
      <div className="rounded-lg border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
        {t(locale, "activityEmpty")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          {t(locale, "activity")}
          {unreadCount > 0 ? (
            <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[10px] font-bold text-white">
              {unreadCount}
            </span>
          ) : null}
        </h1>
        <button
          type="button"
          onClick={markSeen}
          className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          title={t(locale, "activityMarkSeen")}
        >
          {t(locale, "activityMarkSeen")}
        </button>
      </div>

      {newest.length > 0 && (
        <section>
          <h2 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {t(locale, "activityNewest")}
          </h2>
          {renderList(newest)}
        </section>
      )}

      {earlier.length > 0 && (
        <section>
          <h2 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {t(locale, "activityEarlier")}
          </h2>
          {renderList(earlier)}
        </section>
      )}
    </div>
  );
}
