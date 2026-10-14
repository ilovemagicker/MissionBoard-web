"use client";

import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createSpaceAnnouncementAction,
  deleteAnnouncementAction,
  dismissSpaceAnnouncementAction,
  markAnnouncementsReadAction,
  updateSpaceAnnouncementAction,
} from "@/app/actions/polls-announcements";
import { formatDateTime } from "@/lib/format";
import { t, tf } from "@/lib/i18n";
import type {
  Locale,
  MissionAnnouncementRow,
  ProfileRow,
} from "@/lib/types";

function headline(a: MissionAnnouncementRow): string {
  const title = a.title?.trim();
  if (title) return title;
  return a.body.split("\n")[0]?.trim() || a.body.slice(0, 80);
}

export function SpaceAnnouncementsBoard({
  locale,
  spaceId,
  announcements,
  dismissedIds,
  readByMe,
  readCounts,
  profiles,
  canPost,
  enabled,
}: {
  locale: Locale;
  spaceId: string;
  announcements: MissionAnnouncementRow[];
  dismissedIds: string[];
  readByMe: string[];
  readCounts: Record<string, number>;
  profiles: Record<string, ProfileRow>;
  canPost: boolean;
  enabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState<MissionAnnouncementRow | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const dismissed = useMemo(() => new Set(dismissedIds), [dismissedIds]);
  const readSet = useMemo(() => new Set(readByMe), [readByMe]);

  const visibleLatest = useMemo(
    () => announcements.find((a) => !dismissed.has(a.id)) ?? null,
    [announcements, dismissed]
  );

  const unreadCount = useMemo(
    () => announcements.filter((a) => !readSet.has(a.id)).length,
    [announcements, readSet]
  );

  useEffect(() => {
    if (!enabled || !visibleLatest) return;
    if (!readSet.has(visibleLatest.id)) {
      void markAnnouncementsReadAction([visibleLatest.id]);
    }
  }, [enabled, visibleLatest, readSet]);

  if (!enabled) return null;
  if (announcements.length === 0 && !canPost) return null;

  function run(fn: () => Promise<{ error?: string; ok?: boolean }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
      else {
        setComposing(false);
        setEditing(null);
        setTitle("");
        setBody("");
        router.refresh();
      }
    });
  }

  function openComposer(a?: MissionAnnouncementRow) {
    if (a) {
      setEditing(a);
      setTitle(a.title ?? "");
      setBody(a.body);
    } else {
      setEditing(null);
      setTitle("");
      setBody("");
    }
    setComposing(true);
    setShowAll(true);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    const ttl = title.trim() || null;
    if (editing) {
      run(() =>
        updateSpaceAnnouncementAction({ id: editing.id, title: ttl, body: text })
      );
    } else {
      run(() =>
        createSpaceAnnouncementAction({ spaceId, title: ttl, body: text })
      );
    }
  }

  return (
    <div className="space-y-2">
      {visibleLatest ? (
        <div
          className={`rounded-2xl bg-orange-50/80 p-4 ring-1 ${
            !readSet.has(visibleLatest.id)
              ? "ring-orange-400"
              : "ring-orange-200"
          }`}
        >
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-orange-700">
              📣 {t(locale, "spaceAnnouncementBoardTitle")}
            </span>
            {!readSet.has(visibleLatest.id) && (
              <span
                className="inline-block h-2 w-2 rounded-full bg-red-500"
                title={t(locale, "spaceAnnouncementUnreadA11y")}
              />
            )}
            <button
              type="button"
              onClick={() => {
                setShowAll(true);
                void markAnnouncementsReadAction(announcements.map((a) => a.id));
              }}
              className="ml-auto text-xs font-semibold text-blue-700"
            >
              {t(locale, "spaceAnnouncementAll")}
              {announcements.length > 1 ? ` ${announcements.length}` : ""} ›
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                void markAnnouncementsReadAction([visibleLatest.id]);
                run(() =>
                  dismissSpaceAnnouncementAction(visibleLatest.id, true)
                );
              }}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-orange-100"
              aria-label={t(locale, "spaceAnnouncementDismiss")}
            >
              ✕
            </button>
          </div>
          <button
            type="button"
            className="w-full text-left"
            onClick={() => {
              setExpanded((v) => !v);
              void markAnnouncementsReadAction([visibleLatest.id]);
            }}
          >
            <p className="text-sm font-semibold text-slate-900">
              {headline(visibleLatest)}
            </p>
            {(visibleLatest.title?.trim() || expanded) && (
              <p
                className={`mt-1 text-sm text-slate-600 whitespace-pre-wrap ${
                  expanded ? "" : "line-clamp-2"
                }`}
              >
                {visibleLatest.body}
              </p>
            )}
            <p className="mt-2 text-[11px] text-slate-500">
              {profiles[visibleLatest.author_id]?.display_name ||
                visibleLatest.author_id.slice(0, 8)}{" "}
              · {formatDateTime(visibleLatest.created_at, locale)}
              {visibleLatest.updated_at &&
                new Date(visibleLatest.updated_at).getTime() -
                  new Date(visibleLatest.created_at).getTime() >
                  2000 &&
                ` · ${t(locale, "announcementEdited")}`}
            </p>
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            if (announcements.length === 0 && canPost) openComposer();
            else setShowAll(true);
          }}
          className="inline-flex items-center gap-2 rounded-full bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-800 ring-1 ring-orange-200"
        >
          📣{" "}
          {announcements.length === 0
            ? t(locale, "spaceAnnouncementPost")
            : t(locale, "spaceAnnouncementBoardTitle")}
          {announcements.length > 0 && (
            <span className="font-normal text-orange-700">
              {tf(locale, "spaceAnnouncementCollapsedRow", {
                n: announcements.length,
              })}
            </span>
          )}
          {unreadCount > 0 && (
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
          )}
        </button>
      )}

      {showAll && (
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-800">
              {t(locale, "spaceAnnouncementBoardTitle")}
            </h3>
            {canPost && (
              <button
                type="button"
                onClick={() => openComposer()}
                className="rounded-xl bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-800 ring-1 ring-orange-200"
              >
                + {t(locale, "spaceAnnouncementPost")}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setShowAll(false);
                setComposing(false);
              }}
              className="ml-auto text-xs font-semibold text-slate-500"
            >
              {t(locale, "close")}
            </button>
          </div>

          {composing && (
            <form onSubmit={onSubmit} className="mb-4 space-y-2 rounded-xl bg-orange-50/50 p-3">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                placeholder={t(locale, "spaceAnnouncementTitlePlaceholder")}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
              />
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={3}
                maxLength={2000}
                required
                placeholder={t(locale, "spaceAnnouncementBodyPlaceholder")}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              />
              <p className="text-[11px] text-slate-400">
                {t(locale, "spaceAnnouncementAudienceFooter")}
              </p>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={pending || !body.trim()}
                  className="rounded-xl bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {editing ? t(locale, "save") : t(locale, "announcementPublish")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setComposing(false);
                    setEditing(null);
                  }}
                  className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700"
                >
                  {t(locale, "cancel")}
                </button>
              </div>
            </form>
          )}

          {announcements.length === 0 ? (
            <p className="text-sm text-slate-500">
              {t(locale, "spaceAnnouncementEmpty")}
              <br />
              <span className="text-xs">{t(locale, "spaceAnnouncementAdminOnlyHint")}</span>
            </p>
          ) : (
            <ul className="space-y-3">
              {announcements.map((a) => {
                const isDismissed = dismissed.has(a.id);
                return (
                  <li
                    key={a.id}
                    className={`rounded-xl p-3 ring-1 ${
                      isDismissed
                        ? "bg-slate-50 ring-slate-100 opacity-70"
                        : "bg-orange-50/40 ring-orange-100"
                    }`}
                  >
                    <div className="flex flex-wrap items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900">
                          {headline(a)}
                        </p>
                        {a.title?.trim() && (
                          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">
                            {a.body}
                          </p>
                        )}
                        <p className="mt-1 text-[11px] text-slate-500">
                          {profiles[a.author_id]?.display_name ||
                            a.author_id.slice(0, 8)}{" "}
                          · {formatDateTime(a.created_at, locale)} · 👁{" "}
                          {readCounts[a.id] ?? 0}
                        </p>
                      </div>
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            run(() =>
                              dismissSpaceAnnouncementAction(a.id, !isDismissed)
                            )
                          }
                          className="text-[11px] font-semibold text-slate-600"
                        >
                          {isDismissed
                            ? t(locale, "spaceAnnouncementRestore")
                            : t(locale, "spaceAnnouncementDismiss")}
                        </button>
                        {canPost && (
                          <>
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => openComposer(a)}
                              className="text-[11px] font-semibold text-orange-700"
                            >
                              {t(locale, "spaceAnnouncementEdit")}
                            </button>
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => {
                                if (
                                  !window.confirm(
                                    t(locale, "spaceAnnouncementDeleteConfirm")
                                  )
                                )
                                  return;
                                run(() => deleteAnnouncementAction(a.id, null));
                              }}
                              className="text-[11px] font-semibold text-red-600"
                            >
                              {t(locale, "delete")}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {error && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
