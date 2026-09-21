"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";
import {
  addCommentAction,
  addStepAction,
  archiveMissionAction,
  assignStepAction,
  claimStepAction,
  deleteMissionAction,
  toggleStepDoneAction,
  toggleWorkingAction,
  unarchiveMissionAction,
  updateMissionStatusAction,
} from "@/app/actions/missions";
import { roleLabel, statusLabel, t } from "@/lib/i18n";
import type {
  Locale,
  MissionCommentRow,
  MissionReaderRow,
  MissionRow,
  MissionStatus,
  MissionStepRow,
  MissionWorkerRow,
  ProfileRow,
} from "@/lib/types";

type PeoplePanel = "readers" | "workers" | null;

export function MissionDetailClient({
  locale,
  mission,
  steps,
  comments,
  members,
  profiles,
  readers,
  workers,
  isWorking,
  userId,
}: {
  locale: Locale;
  mission: MissionRow;
  steps: MissionStepRow[];
  comments: MissionCommentRow[];
  members: { user_id: string; role: string }[];
  profiles: Record<string, ProfileRow>;
  readers: MissionReaderRow[];
  workers: MissionWorkerRow[];
  isWorking: boolean;
  userId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [stepTitle, setStepTitle] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [stepComments, setStepComments] = useState<Record<string, string>>({});
  const [panel, setPanel] = useState<PeoplePanel>(null);

  function run(fn: () => Promise<{ error?: string; ok?: boolean } | void>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res && "error" in res && res.error) setError(res.error);
      else router.refresh();
    });
  }

  const missionComments = comments.filter((c) => !c.step_id);
  const commentsByStep = (stepId: string) =>
    comments.filter((c) => c.step_id === stepId);
  const isArchived = !!mission.archived_at;

  async function onAddStep(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("mission_id", mission.id);
    fd.set("title", stepTitle);
    run(async () => {
      const res = await addStepAction(fd);
      if (!res.error) setStepTitle("");
      return res;
    });
  }

  async function onAddMissionComment(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("mission_id", mission.id);
    fd.set("body", commentBody);
    run(async () => {
      const res = await addCommentAction(fd);
      if (!res.error) setCommentBody("");
      return res;
    });
  }

  function onArchiveToggle() {
    if (!isArchived && !window.confirm(t(locale, "archiveConfirm"))) return;
    run(() =>
      isArchived
        ? unarchiveMissionAction(mission.id)
        : archiveMissionAction(mission.id)
    );
  }

  function onDelete() {
    if (!window.confirm(t(locale, "deleteConfirm"))) return;
    run(() => deleteMissionAction(mission.id));
  }

  const panelRows =
    panel === "readers"
      ? readers.map((r) => ({
          userId: r.user_id,
          at: r.read_at,
          timeLabel: t(locale, "readAt"),
        }))
      : panel === "workers"
        ? workers.map((w) => ({
            userId: w.user_id,
            at: w.started_at,
            timeLabel: t(locale, "workingSince"),
          }))
        : [];

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200/80">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900">{mission.title}</h1>
              {isArchived && (
                <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
                  {t(locale, "archived")}
                </span>
              )}
            </div>
            {mission.description && (
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">
                {mission.description}
              </p>
            )}
            <p className="mt-2 text-xs text-slate-500">
              {mission.start_date ? `${t(locale, "startDate")}: ${mission.start_date}` : ""}
              {mission.start_date && mission.due_date ? " · " : ""}
              {mission.due_date ? `${t(locale, "dueDate")}: ${mission.due_date}` : ""}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPanel("readers")}
                className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
              >
                {t(locale, "readers")} · {readers.length}
              </button>
              <button
                type="button"
                onClick={() => setPanel("workers")}
                className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100"
              >
                {t(locale, "workers")} · {workers.length}
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <select
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium"
              value={mission.status}
              disabled={pending}
              onChange={(e) =>
                run(() =>
                  updateMissionStatusAction(
                    mission.id,
                    e.target.value as MissionStatus
                  )
                )
              }
            >
              {(["todo", "inProgress", "done"] as MissionStatus[]).map((s) => (
                <option key={s} value={s}>
                  {statusLabel(locale, s)}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => toggleWorkingAction(mission.id, !isWorking))}
              className={`rounded-xl px-3 py-2 text-sm font-semibold ${
                isWorking
                  ? "bg-amber-100 text-amber-800"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              {isWorking ? t(locale, "stopWorking") : t(locale, "working")}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={onArchiveToggle}
              className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700"
            >
              {isArchived ? t(locale, "unarchive") : t(locale, "archive")}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={onDelete}
              className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700"
            >
              {t(locale, "delete")}
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200/80">
        <h2 className="mb-4 text-sm font-semibold tracking-wide text-slate-500">
          {t(locale, "steps")}
        </h2>
        <ul className="space-y-4">
          {steps.map((step) => {
            const assigneeName = step.assignee_id
              ? profiles[step.assignee_id]?.display_name || step.assignee_id.slice(0, 8)
              : t(locale, "unassigned");
            const isMine = step.assignee_id === userId;
            return (
              <li
                key={step.id}
                className="rounded-2xl border border-slate-100 bg-slate-50 p-3"
              >
                <div className="flex flex-wrap items-start gap-3">
                  <input
                    type="checkbox"
                    checked={step.is_done}
                    disabled={pending}
                    onChange={(e) =>
                      run(() =>
                        toggleStepDoneAction(step.id, mission.id, e.target.checked)
                      )
                    }
                    className="mt-1 h-4 w-4"
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm font-medium ${
                        step.is_done ? "text-slate-400 line-through" : "text-slate-900"
                      }`}
                    >
                      {step.title}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {assigneeName}
                      {step.deadline_date ? ` · ${step.deadline_date}` : ""}
                      {step.completed_at
                        ? ` · ✓ ${new Date(step.completed_at).toLocaleString()}`
                        : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          run(() => claimStepAction(step.id, mission.id, !isMine))
                        }
                        className="rounded-lg bg-white px-2 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200"
                      >
                        {isMine ? t(locale, "unclaim") : t(locale, "claim")}
                      </button>
                      <select
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                        value={step.assignee_id ?? ""}
                        disabled={pending}
                        onChange={(e) =>
                          run(() =>
                            assignStepAction(
                              step.id,
                              mission.id,
                              e.target.value || null
                            )
                          )
                        }
                      >
                        <option value="">{t(locale, "unassigned")}</option>
                        {members.map((m) => (
                          <option key={m.user_id} value={m.user_id}>
                            {profiles[m.user_id]?.display_name ||
                              m.user_id.slice(0, 8)}{" "}
                            ({roleLabel(locale, m.role)})
                          </option>
                        ))}
                      </select>
                    </div>

                    <ul className="mt-3 space-y-1">
                      {commentsByStep(step.id).map((c) => (
                        <li key={c.id} className="text-xs text-slate-600">
                          <span className="font-semibold">
                            {profiles[c.author_id]?.display_name || "?"}
                          </span>
                          : {c.body}
                        </li>
                      ))}
                    </ul>
                    <form
                      className="mt-2 flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const body = stepComments[step.id]?.trim();
                        if (!body) return;
                        const fd = new FormData();
                        fd.set("mission_id", mission.id);
                        fd.set("step_id", step.id);
                        fd.set("body", body);
                        run(async () => {
                          const res = await addCommentAction(fd);
                          if (!res.error) {
                            setStepComments((prev) => ({ ...prev, [step.id]: "" }));
                          }
                          return res;
                        });
                      }}
                    >
                      <input
                        value={stepComments[step.id] ?? ""}
                        onChange={(e) =>
                          setStepComments((prev) => ({
                            ...prev,
                            [step.id]: e.target.value,
                          }))
                        }
                        placeholder={t(locale, "comments")}
                        className="h-8 flex-1 rounded-lg border border-slate-200 px-2 text-xs"
                      />
                      <button
                        type="submit"
                        className="rounded-lg bg-blue-600 px-2 text-xs font-semibold text-white"
                      >
                        {t(locale, "addComment")}
                      </button>
                    </form>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <form onSubmit={onAddStep} className="mt-4 flex gap-2">
          <input
            value={stepTitle}
            onChange={(e) => setStepTitle(e.target.value)}
            placeholder={t(locale, "addStep")}
            className="h-10 flex-1 rounded-xl border border-slate-200 px-3 text-sm"
            required
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white"
          >
            {t(locale, "addStep")}
          </button>
        </form>
      </section>

      <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200/80">
        <h2 className="mb-4 text-sm font-semibold tracking-wide text-slate-500">
          {t(locale, "comments")}
        </h2>
        <ul className="mb-4 space-y-2">
          {missionComments.length === 0 && (
            <li className="text-sm text-slate-400">—</li>
          )}
          {missionComments.map((c) => (
            <li key={c.id} className="rounded-xl bg-slate-50 px-3 py-2 text-sm">
              <span className="font-semibold text-slate-800">
                {profiles[c.author_id]?.display_name || "?"}
              </span>
              <span className="ml-2 text-slate-600">{c.body}</span>
              <p className="mt-0.5 text-xs text-slate-400">
                {new Date(c.created_at).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
        <form onSubmit={onAddMissionComment} className="flex gap-2">
          <input
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            placeholder={t(locale, "comments")}
            className="h-10 flex-1 rounded-xl border border-slate-200 px-3 text-sm"
            required
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white"
          >
            {t(locale, "addComment")}
          </button>
        </form>
      </section>

      {panel && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          onClick={() => setPanel(null)}
        >
          <div
            className="w-full max-w-md rounded-3xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                {panel === "readers" ? t(locale, "readers") : t(locale, "workers")}
              </h3>
              <button
                type="button"
                onClick={() => setPanel(null)}
                className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100"
              >
                {t(locale, "close")}
              </button>
            </div>
            {panelRows.length === 0 ? (
              <p className="text-sm text-slate-500">
                {panel === "readers"
                  ? t(locale, "readersEmpty")
                  : t(locale, "workersEmpty")}
              </p>
            ) : (
              <ul className="max-h-80 space-y-2 overflow-y-auto">
                {panelRows.map((row) => (
                  <li
                    key={`${row.userId}-${row.at}`}
                    className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2"
                  >
                    <span className="text-sm font-semibold text-slate-800">
                      {profiles[row.userId]?.display_name || row.userId.slice(0, 8)}
                    </span>
                    <span className="text-xs text-slate-500">
                      {row.timeLabel}{" "}
                      {new Date(row.at).toLocaleString(
                        locale === "en" ? "en-US" : "zh-HK"
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
