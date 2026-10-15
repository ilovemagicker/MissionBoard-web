"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  castPollVoteAction,
  closeMissionPollAction,
  createMissionPollAction,
  deleteMissionPollAction,
} from "@/app/actions/polls-announcements";
import { formatDateTime } from "@/lib/format";
import { listSeparator, t, tf } from "@/lib/i18n";
import type {
  Locale,
  MissionPollOptionRow,
  MissionPollResultRow,
  MissionPollRow,
  MissionPollVoteRow,
  ProfileRow,
} from "@/lib/types";

function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function MissionPollsPanel({
  locale,
  missionId,
  polls,
  options,
  votes,
  results,
  profiles,
  userId,
  canVote,
  canClose,
  canDelete,
  enabled,
  isArchived,
}: {
  locale: Locale;
  missionId: string;
  polls: MissionPollRow[];
  options: MissionPollOptionRow[];
  votes: MissionPollVoteRow[];
  results: MissionPollResultRow[];
  profiles: Record<string, ProfileRow>;
  userId: string;
  canVote: boolean;
  canClose: (p: MissionPollRow) => boolean;
  canDelete: (p: MissionPollRow) => boolean;
  enabled: boolean;
  isArchived: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [question, setQuestion] = useState("");
  const [optionLabels, setOptionLabels] = useState(["", ""]);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [hasDeadline, setHasDeadline] = useState(false);
  const [deadlineLocal, setDeadlineLocal] = useState("");
  const [closingPollId, setClosingPollId] = useState<string | null>(null);

  const optionsByPoll = useMemo(() => {
    const m: Record<string, MissionPollOptionRow[]> = {};
    for (const o of options) {
      if (!m[o.poll_id]) m[o.poll_id] = [];
      m[o.poll_id].push(o);
    }
    for (const id of Object.keys(m)) {
      m[id].sort((a, b) => a.position - b.position);
    }
    return m;
  }, [options]);

  const countByOption = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of results) m[r.option_id] = r.vote_count;
    return m;
  }, [results]);

  const voterCountByPoll = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of results) {
      if (m[r.poll_id] == null) m[r.poll_id] = r.voter_count;
    }
    return m;
  }, [results]);

  const myVotesByPoll = useMemo(() => {
    const m: Record<string, Set<string>> = {};
    for (const v of votes) {
      if (v.user_id !== userId) continue;
      if (!m[v.poll_id]) m[v.poll_id] = new Set();
      m[v.poll_id].add(v.option_id);
    }
    return m;
  }, [votes, userId]);

  const votersByOption = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const v of votes) {
      if (!m[v.option_id]) m[v.option_id] = [];
      m[v.option_id].push(v.user_id);
    }
    return m;
  }, [votes]);

  if (!enabled) return null;
  if (polls.length === 0 && !canVote) return null;

  function run(fn: () => Promise<{ error?: string; ok?: boolean }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
      else {
        setComposing(false);
        setClosingPollId(null);
        router.refresh();
      }
    });
  }

  function onCreate(e: FormEvent) {
    e.preventDefault();
    const opts = optionLabels.map((x) => x.trim()).filter(Boolean);
    let deadlineAt: string | null = null;
    if (hasDeadline && deadlineLocal) {
      const d = new Date(deadlineLocal);
      if (!Number.isNaN(d.getTime())) deadlineAt = d.toISOString();
    }
    run(async () => {
      const res = await createMissionPollAction({
        missionId,
        question,
        options: opts,
        allowMultiple,
        anonymous,
        deadlineAt,
      });
      if (!res.error) {
        setQuestion("");
        setOptionLabels(["", ""]);
        setAllowMultiple(false);
        setAnonymous(false);
        setHasDeadline(false);
        setDeadlineLocal("");
      }
      return res;
    });
  }

  function toggleVote(poll: MissionPollRow, optionId: string) {
    if (!canVote || poll.closed_at || isArchived) return;
    const mine = new Set(myVotesByPoll[poll.id] ?? []);
    if (poll.allow_multiple) {
      if (mine.has(optionId)) mine.delete(optionId);
      else mine.add(optionId);
    } else {
      if (mine.has(optionId) && mine.size === 1) mine.clear();
      else {
        mine.clear();
        mine.add(optionId);
      }
    }
    run(() => castPollVoteAction(poll.id, Array.from(mine), missionId));
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-wide text-slate-500">
          📊 {t(locale, "pollSectionTitle")}
        </h2>
        {canVote && !isArchived && !composing && (
          <button
            type="button"
            onClick={() => setComposing(true)}
            className="rounded-xl bg-brand/10 px-3 py-1.5 text-xs font-semibold text-brand ring-1 ring-brand/30"
          >
            + {t(locale, "pollCreate")}
          </button>
        )}
      </div>

      {polls.length === 0 && !composing && (
        <p className="text-sm text-slate-500">{t(locale, "pollEmptyHint")}</p>
      )}

      {composing && (
        <form onSubmit={onCreate} className="mb-4 space-y-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
          <h3 className="text-sm font-semibold text-slate-800">
            {t(locale, "pollCreateTitle")}
          </h3>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">
              {t(locale, "pollQuestion")}
            </span>
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={300}
              placeholder={t(locale, "pollQuestionPlaceholder")}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
              required
            />
          </label>
          <div className="space-y-2">
            <span className="block text-sm font-medium text-slate-700">
              {t(locale, "pollOptions")}
            </span>
            {optionLabels.map((label, i) => (
              <input
                key={i}
                value={label}
                onChange={(e) => {
                  const next = [...optionLabels];
                  next[i] = e.target.value;
                  setOptionLabels(next);
                }}
                maxLength={120}
                placeholder={tf(locale, "pollOptionPlaceholder", { n: i + 1 })}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
              />
            ))}
            {optionLabels.length < 10 && (
              <button
                type="button"
                onClick={() => setOptionLabels([...optionLabels, ""])}
                className="text-xs font-semibold text-brand"
              >
                + {t(locale, "pollAddOption")}
              </button>
            )}
            <p className="text-[11px] text-slate-400">
              {t(locale, "pollOptionsFooter")}
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={allowMultiple}
              onChange={(e) => setAllowMultiple(e.target.checked)}
            />
            {t(locale, "pollAllowMultiple")}
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={anonymous}
              onChange={(e) => setAnonymous(e.target.checked)}
            />
            {t(locale, "pollAnonymousToggle")}
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={hasDeadline}
              onChange={(e) => setHasDeadline(e.target.checked)}
            />
            {t(locale, "pollDeadlineToggle")}
          </label>
          {hasDeadline && (
            <input
              type="datetime-local"
              value={deadlineLocal || toLocalInputValue(new Date(Date.now() + 86400000).toISOString())}
              onChange={(e) => setDeadlineLocal(e.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
            />
          )}
          <p className="text-[11px] text-slate-400">
            {t(locale, "pollSettingsFooter")}
          </p>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-xl bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {t(locale, "create")}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setComposing(false)}
              className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700"
            >
              {t(locale, "cancel")}
            </button>
          </div>
        </form>
      )}

      <ul className="space-y-5">
        {polls.map((poll) => {
          const opts = optionsByPoll[poll.id] ?? [];
          const mine = myVotesByPoll[poll.id] ?? new Set<string>();
          const total = opts.reduce((s, o) => s + (countByOption[o.id] ?? 0), 0);
          const voters = voterCountByPoll[poll.id] ?? 0;
          const closed = !!poll.closed_at;
          const finalIds = new Set(poll.final_option_ids ?? []);
          return (
            <li key={poll.id} className="space-y-2 border-t border-slate-100 pt-4 first:border-0 first:pt-0">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">{poll.question}</p>
                <div className="flex flex-wrap gap-1">
                  {canClose(poll) && !closed && !isArchived && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => setClosingPollId(poll.id)}
                      className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700"
                    >
                      {t(locale, "pollClose")}
                    </button>
                  )}
                  {canDelete(poll) && !isArchived && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        if (!window.confirm(t(locale, "pollDeleteConfirm"))) return;
                        run(() => deleteMissionPollAction(poll.id, missionId));
                      }}
                      className="rounded-lg bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700"
                    >
                      {t(locale, "delete")}
                    </button>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="rounded-full bg-brand/10 px-2 py-0.5 font-semibold text-brand">
                  {poll.allow_multiple ? t(locale, "pollMulti") : t(locale, "pollSingle")}
                </span>
                {poll.anonymous && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
                    {t(locale, "pollAnonymous")}
                  </span>
                )}
                {closed ? (
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 font-semibold text-slate-600">
                    {t(locale, "pollClosed")}
                  </span>
                ) : poll.deadline_at ? (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-800">
                    {tf(locale, "pollDeadline", {
                      when: formatDateTime(poll.deadline_at, locale),
                    })}
                  </span>
                ) : null}
                <span className="ml-auto text-slate-500">
                  {tf(locale, "pollVoterCount", { n: voters })}
                </span>
              </div>

              {closingPollId === poll.id && (
                <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <p className="mb-2 text-xs text-slate-600">
                    {t(locale, "pollCloseConfirm")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        run(() => closeMissionPollAction(poll.id, missionId, null))
                      }
                      className="rounded-lg bg-brand px-2 py-1 text-[11px] font-semibold text-white"
                    >
                      {t(locale, "pollCloseTopVoted")}
                    </button>
                    {opts.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          run(() =>
                            closeMissionPollAction(poll.id, missionId, [o.id])
                          )
                        }
                        className="rounded-lg bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200"
                      >
                        {tf(locale, "pollFinalizeAs", { label: o.label })}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setClosingPollId(null)}
                      className="rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-500"
                    >
                      {t(locale, "cancel")}
                    </button>
                  </div>
                </div>
              )}

              <ul className="space-y-2">
                {opts.map((o) => {
                  const count = countByOption[o.id] ?? 0;
                  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                  const selected = mine.has(o.id);
                  const isFinal = finalIds.has(o.id);
                  const voterNames = poll.anonymous
                    ? []
                    : (votersByOption[o.id] ?? []).map(
                        (uid) =>
                          profiles[uid]?.display_name || uid.slice(0, 8)
                      );
                  return (
                    <li key={o.id}>
                      <button
                        type="button"
                        disabled={pending || !canVote || closed || isArchived}
                        onClick={() => toggleVote(poll, o.id)}
                        className={`w-full rounded-xl px-3 py-2 text-left ring-1 transition ${
                          selected
                            ? "bg-brand/10 ring-brand/40"
                            : "bg-white ring-slate-200 hover:bg-slate-50"
                        } disabled:cursor-default disabled:opacity-80`}
                      >
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-slate-400">
                            {poll.allow_multiple
                              ? selected
                                ? "☑"
                                : "☐"
                              : selected
                                ? "●"
                                : "○"}
                          </span>
                          <span
                            className={`flex-1 ${isFinal ? "font-bold text-green-800" : "text-slate-800"}`}
                          >
                            {o.label}
                          </span>
                          <span className="font-mono text-xs text-slate-500">
                            {count} · {pct}%
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full rounded-full ${isFinal ? "bg-green-500" : selected ? "bg-brand" : "bg-brand/40"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        {voterNames.length > 0 && (
                          <p className="mt-1 text-[11px] text-slate-500">
                            {voterNames.join(listSeparator(locale))}
                          </p>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>

              {closed && finalIds.size > 0 && (
                <p className="text-xs font-semibold text-green-700">
                  ✓{" "}
                  {tf(locale, "pollResultFormat", {
                    labels: opts
                      .filter((o) => finalIds.has(o.id))
                      .map((o) => o.label)
                      .join(listSeparator(locale)),
                  })}
                </p>
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
