"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createMissionAnnouncementAction,
  deleteAnnouncementAction,
  markAnnouncementsReadAction,
  updateMissionAnnouncementAction,
} from "@/app/actions/polls-announcements";
import { formatDateTime } from "@/lib/format";
import { t } from "@/lib/i18n";
import type {
  Locale,
  MissionAnnouncementRow,
  ProfileRow,
} from "@/lib/types";

export function MissionAnnouncementsPanel({
  locale,
  missionId,
  spaceId,
  announcements,
  readCounts,
  profiles,
  canPost,
  canModerate,
  enabled,
  isArchived,
}: {
  locale: Locale;
  missionId: string;
  spaceId: string;
  announcements: MissionAnnouncementRow[];
  readCounts: Record<string, number>;
  profiles: Record<string, ProfileRow>;
  canPost: boolean;
  /** (a) => author / mission creator / admin */
  canModerate: (a: MissionAnnouncementRow) => boolean;
  enabled: boolean;
  isArchived: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [body, setBody] = useState("");

  useEffect(() => {
    if (!enabled || announcements.length === 0) return;
    void markAnnouncementsReadAction(announcements.map((a) => a.id));
  }, [enabled, announcements]);

  if (!enabled) return null;
  if (announcements.length === 0 && !canPost) return null;

  function run(fn: () => Promise<{ error?: string; ok?: boolean }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
      else {
        setComposing(false);
        setEditingId(null);
        setBody("");
        router.refresh();
      }
    });
  }

  function startEdit(a: MissionAnnouncementRow) {
    setEditingId(a.id);
    setBody(a.body);
    setComposing(false);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    if (editingId) {
      run(() => updateMissionAnnouncementAction(editingId, text, missionId));
    } else {
      run(() =>
        createMissionAnnouncementAction({ missionId, spaceId, body: text })
      );
    }
  }

  return (
    <section className="rounded-lg border border-orange-200 bg-white p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-wide text-orange-700">
          📣 {t(locale, "announcementBoardTitle")}
        </h2>
        {canPost && !isArchived && !composing && !editingId && (
          <button
            type="button"
            onClick={() => {
              setComposing(true);
              setBody("");
            }}
            className="rounded-xl bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-800 ring-1 ring-orange-200"
          >
            + {t(locale, "announcementPost")}
          </button>
        )}
      </div>

      {announcements.length === 0 && !composing && (
        <p className="text-sm text-slate-500">{t(locale, "announcementEmptyHint")}</p>
      )}

      {(composing || editingId) && (
        <form onSubmit={onSubmit} className="mb-4 space-y-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder={t(locale, "announcementPlaceholder")}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
          />
          <p className="text-[11px] text-slate-400">
            {t(locale, "announcementAudienceFooter")}
          </p>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending || !body.trim()}
              className="rounded-xl bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {editingId ? t(locale, "save") : t(locale, "announcementPublish")}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setComposing(false);
                setEditingId(null);
                setBody("");
              }}
              className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700"
            >
              {t(locale, "cancel")}
            </button>
          </div>
        </form>
      )}

      <ul className="space-y-3">
        {announcements.map((a) => {
          const edited =
            a.updated_at &&
            a.created_at &&
            new Date(a.updated_at).getTime() - new Date(a.created_at).getTime() >
              2000;
          return (
            <li
              key={a.id}
              className="rounded-2xl bg-orange-50/60 p-3 ring-1 ring-orange-100"
            >
              <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                <span className="font-semibold text-slate-700">
                  {profiles[a.author_id]?.display_name ||
                    a.author_id.slice(0, 8)}
                </span>
                <span>{formatDateTime(a.created_at, locale)}</span>
                {edited && <span>{t(locale, "announcementEdited")}</span>}
                <span className="ml-auto">
                  👁 {readCounts[a.id] ?? 0}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-slate-800">
                {a.body}
              </p>
              {canModerate(a) && !isArchived && (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => startEdit(a)}
                    className="text-xs font-semibold text-orange-700"
                  >
                    {t(locale, "announcementEdit")}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      if (!window.confirm(t(locale, "announcementDeleteConfirm")))
                        return;
                      run(() => deleteAnnouncementAction(a.id, missionId));
                    }}
                    className="text-xs font-semibold text-red-600"
                  >
                    {t(locale, "delete")}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {error && (
        <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
