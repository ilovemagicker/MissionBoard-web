"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";
import {
  addCommentAction,
  addStepAction,
  archiveMissionAction,
  acceptStepClaimAction,
  assignStepAction,
  cancelStepClaimAction,
  claimStepAction,
  declineStepClaimAction,
  deleteMissionAction,
  approveMissionDecisionAction,
  indentStepAction,
  outdentStepAction,
  requestMissionDecisionAction,
  returnMissionDecisionAction,
  toggleStepDoneAction,
  updateStepDeadlineAction,
  toggleWorkingAction,
  unarchiveMissionAction,
  updateMissionDecisionMakerAction,
  updateMissionFlagIconAction,
  updateMissionPriorityAction,
  updateMissionStatusAction,
} from "@/app/actions/missions";
import {
  FlagIconPicker,
  MissionFlagIconView,
} from "@/components/flag-icon";
import { MissionAnnouncementsPanel } from "@/components/mission-announcements-panel";
import { MissionPollsPanel } from "@/components/mission-polls-panel";
import { MissionRecurrencePanel } from "@/components/mission-recurrence-panel";
import { MissionStartReminderPanel } from "@/components/mission-start-reminder-panel";
import { roleLabel, statusLabel, t, tf } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import {
  canIndentStep,
  canOutdentStep,
  flattenStepTree,
} from "@/lib/step-tree";
import type {
  Locale,
  MissionAnnouncementRow,
  MissionCommentRow,
  MissionPollOptionRow,
  MissionPollResultRow,
  MissionPollRow,
  MissionPollVoteRow,
  MissionPriority,
  MissionReaderRow,
  MissionRecurrenceRow,
  MissionRow,
  MissionStatus,
  MissionStepRow,
  MissionWorkerRow,
  ProfileRow,
  StepClaimRequestRow,
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
  claimRequests,
  recurrence,
  pollsEnabled = false,
  polls = [],
  pollOptions = [],
  pollVotes = [],
  pollResults = [],
  announcements = [],
  announcementReadCounts = {},
  startReminderEnabled = false,
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
  claimRequests: StepClaimRequestRow[];
  recurrence: MissionRecurrenceRow | null;
  pollsEnabled?: boolean;
  polls?: MissionPollRow[];
  pollOptions?: MissionPollOptionRow[];
  pollVotes?: MissionPollVoteRow[];
  pollResults?: MissionPollResultRow[];
  announcements?: MissionAnnouncementRow[];
  announcementReadCounts?: Record<string, number>;
  startReminderEnabled?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [stepTitle, setStepTitle] = useState("");
  const [addUnderParentId, setAddUnderParentId] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [stepComments, setStepComments] = useState<Record<string, string>>({});
  const [panel, setPanel] = useState<PeoplePanel>(null);
  const [showFlagPicker, setShowFlagPicker] = useState(false);
  const treeRows = flattenStepTree(steps);

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
  const myRole = members.find((m) => m.user_id === userId)?.role;
  const canAssign =
    mission.creator_id === userId ||
    myRole === "owner" ||
    myRole === "admin";
  const canEditMeta = canAssign;
  const isSpaceEditor =
    myRole === "owner" || myRole === "admin" || myRole === "member";
  const isAdminLike = myRole === "owner" || myRole === "admin";
  const isDecisionMaker = mission.decision_maker_id === userId;
  const awaitingDecision =
    !!mission.decision_maker_id &&
    !mission.decision_approved_at &&
    !!mission.decision_requested_at;
  const decisionApproved = !!mission.decision_approved_at;
  const pendingByStep = Object.fromEntries(
    claimRequests
      .filter((c) => c.status === "pending")
      .map((c) => [c.step_id, c])
  );

  async function onAddStep(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("mission_id", mission.id);
    fd.set("title", stepTitle);
    if (addUnderParentId) fd.set("parent_step_id", addUnderParentId);
    run(async () => {
      const res = await addStepAction(fd);
      if (!res.error) {
        setStepTitle("");
        setAddUnderParentId(null);
      }
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
    <div className="space-y-4">
      {error && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-6">
        <div className="space-y-4">
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <MissionFlagIconView flagIcon={mission.flag_icon} size={44} />
              <h1 className="text-xl font-semibold text-slate-900">{mission.title}</h1>
              {mission.recurrence_id && (
                <span
                  title={t(locale, "recurrenceIconA11y")}
                  className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-200"
                >
                  ↻ {t(locale, "recurrenceTitle")}
                </span>
              )}
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
              {mission.start_date
                ? `${t(locale, "startDate")}: ${mission.start_date}${
                    mission.start_time_minutes != null
                      ? ` ${String(Math.floor(mission.start_time_minutes / 60)).padStart(2, "0")}:${String(mission.start_time_minutes % 60).padStart(2, "0")}`
                      : ""
                  }`
                : ""}
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
            <div className="mt-4 space-y-2 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200/80">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800">
                  {t(locale, "flagIconSection")}
                </p>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setShowFlagPicker((v) => !v)}
                  className="text-xs font-semibold text-brand hover:text-brand/80"
                >
                  {showFlagPicker
                    ? t(locale, "flagIconCollapse")
                    : t(locale, "flagIconChange")}
                </button>
              </div>
              {!showFlagPicker && (
                <MissionFlagIconView flagIcon={mission.flag_icon} size={40} />
              )}
              {showFlagPicker && (
                <FlagIconPicker
                  locale={locale}
                  showTitle={false}
                  value={mission.flag_icon || "flag.fill"}
                  onChange={(next) => {
                    setShowFlagPicker(false);
                    run(() => updateMissionFlagIconAction(mission.id, next));
                  }}
                />
              )}
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

      <MissionAnnouncementsPanel
        locale={locale}
        missionId={mission.id}
        spaceId={mission.space_id}
        announcements={announcements}
        readCounts={announcementReadCounts}
        profiles={profiles}
        canPost={isSpaceEditor && !isArchived}
        canModerate={(a) =>
          a.author_id === userId ||
          mission.creator_id === userId ||
          isAdminLike
        }
        enabled={pollsEnabled}
        isArchived={isArchived}
      />

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-2 text-sm font-semibold tracking-wide text-slate-500">
          {t(locale, "steps")}
        </h2>
        <p className="mb-4 text-[11px] text-slate-400">
          {t(locale, "nestedStepsHint")}
        </p>
        <ul className="space-y-4">
          {treeRows.map(({ step, depth, childCount, childDoneCount }) => {
            const assigneeName = step.assignee_id
              ? profiles[step.assignee_id]?.display_name || step.assignee_id.slice(0, 8)
              : t(locale, "unassigned");
            const isMine = step.assignee_id === userId;
            const hasChildren = childCount > 0;
            const canIndent = canIndentStep(steps, step.id);
            const canOutdent = canOutdentStep(steps, step.id);
            return (
              <li
                key={step.id}
                className="rounded-2xl border border-slate-100 bg-slate-50 p-3"
                style={{ marginLeft: depth * 16 }}
              >
                <div className="flex flex-wrap items-start gap-3">
                  <input
                    type="checkbox"
                    checked={step.is_done}
                    disabled={pending || hasChildren}
                    title={hasChildren ? t(locale, "stepHasChildren") : undefined}
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
                      {depth > 0 ? "↳ " : ""}
                      {step.title}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {assigneeName}
                      {step.deadline_date
                        ? ` · ${t(locale, "stepDeadline")}: ${step.deadline_date}`
                        : ""}
                      {step.completed_at
                        ? ` · ✓ ${formatDateTime(step.completed_at, locale)}`
                        : ""}
                      {hasChildren
                        ? ` · ${tf(locale, "stepChildrenProgress", {
                            done: childDoneCount,
                            total: childCount,
                          })}`
                        : ""}
                    </p>
                    {!isArchived && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        <label className="flex items-center gap-1.5 font-medium text-slate-600">
                          <span>{t(locale, "stepDeadline")}</span>
                          <input
                            type="date"
                            value={step.deadline_date ?? ""}
                            disabled={pending}
                            onChange={(e) => {
                              const v = e.target.value || null;
                              run(() =>
                                updateStepDeadlineAction(
                                  step.id,
                                  mission.id,
                                  v
                                )
                              );
                            }}
                            className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs"
                          />
                        </label>
                        {step.deadline_date && (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() =>
                              run(() =>
                                updateStepDeadlineAction(
                                  step.id,
                                  mission.id,
                                  null
                                )
                              )
                            }
                            className="rounded-lg bg-white px-2 py-1 font-semibold text-slate-600 ring-1 ring-slate-200"
                          >
                            {t(locale, "clearStepDeadline")}
                          </button>
                        )}
                        <span className="text-[11px] text-slate-400">
                          {t(locale, "stepDeadlineReminderNote")}
                        </span>
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {!isArchived && (
                        <>
                          <button
                            type="button"
                            disabled={pending || !canIndent}
                            onClick={() =>
                              run(() => indentStepAction(step.id, mission.id))
                            }
                            className="rounded-lg bg-white px-2 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 disabled:opacity-40"
                          >
                            {t(locale, "indentStep")}
                          </button>
                          <button
                            type="button"
                            disabled={pending || !canOutdent}
                            onClick={() =>
                              run(() => outdentStepAction(step.id, mission.id))
                            }
                            className="rounded-lg bg-white px-2 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 disabled:opacity-40"
                          >
                            {t(locale, "outdentStep")}
                          </button>
                          <button
                            type="button"
                            disabled={pending || depth >= 4}
                            onClick={() => {
                              setAddUnderParentId(step.id);
                              setStepTitle("");
                            }}
                            className="rounded-lg bg-white px-2 py-1 text-xs font-semibold text-brand ring-1 ring-brand/30 disabled:opacity-40"
                          >
                            {t(locale, "addSubStep")}
                          </button>
                        </>
                      )}
                      {!step.assignee_id &&
                        (() => {
                          const claim = pendingByStep[step.id];
                          if (claim && claim.requester_id === userId) {
                            return (
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() =>
                                  run(() =>
                                    cancelStepClaimAction(claim.id, mission.id)
                                  )
                                }
                                className="rounded-lg bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200"
                              >
                                {t(locale, "claimPending")}
                              </button>
                            );
                          }
                          if (claim) {
                            return (
                              <span className="rounded-lg bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
                                {t(locale, "claimPending")}
                              </span>
                            );
                          }
                          return (
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() =>
                                run(() =>
                                  claimStepAction(step.id, mission.id, true)
                                )
                              }
                              className="rounded-lg bg-white px-2 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200"
                            >
                              {t(locale, "claim")}
                            </button>
                          );
                        })()}
                      {isMine && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            run(() =>
                              claimStepAction(step.id, mission.id, false)
                            )
                          }
                          className="rounded-lg bg-white px-2 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200"
                        >
                          {t(locale, "unclaim")}
                        </button>
                      )}
                      {canAssign && (
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
                      )}
                    </div>
                    {pendingByStep[step.id] &&
                      mission.creator_id === userId && (
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-semibold text-slate-600">
                            {profiles[pendingByStep[step.id].requester_id]
                              ?.display_name || "?"}{" "}
                            — {t(locale, "pendingClaims")}
                          </span>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() =>
                              run(() =>
                                acceptStepClaimAction(
                                  pendingByStep[step.id].id,
                                  mission.id
                                )
                              )
                            }
                            className="rounded-lg bg-brand px-2 py-1 font-semibold text-white"
                          >
                            {t(locale, "acceptClaim")}
                          </button>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() =>
                              run(() =>
                                declineStepClaimAction(
                                  pendingByStep[step.id].id,
                                  mission.id
                                )
                              )
                            }
                            className="rounded-lg bg-white px-2 py-1 font-semibold text-slate-700 ring-1 ring-slate-200"
                          >
                            {t(locale, "declineClaim")}
                          </button>
                        </div>
                      )}

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
                        className="rounded-lg bg-brand px-2 text-xs font-semibold text-white"
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

        {addUnderParentId && (
          <p className="mt-3 text-xs text-brand">
            {t(locale, "addSubStep")}:{" "}
            {steps.find((s) => s.id === addUnderParentId)?.title || "…"}
            <button
              type="button"
              className="ml-2 underline"
              onClick={() => setAddUnderParentId(null)}
            >
              {t(locale, "cancel")}
            </button>
          </p>
        )}
        <form onSubmit={onAddStep} className="mt-4 flex gap-2">
          <input
            value={stepTitle}
            onChange={(e) => setStepTitle(e.target.value)}
            placeholder={
              addUnderParentId ? t(locale, "addSubStep") : t(locale, "addStep")
            }
            className="h-10 flex-1 rounded-xl border border-slate-200 px-3 text-sm"
            required
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-xl bg-brand px-4 text-sm font-semibold text-white"
          >
            {addUnderParentId ? t(locale, "addSubStep") : t(locale, "addStep")}
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
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
                {formatDateTime(c.created_at, locale)}
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
            className="rounded-xl bg-brand px-4 text-sm font-semibold text-white"
          >
            {t(locale, "addComment")}
          </button>
        </form>
      </section>

        </div>
        <aside className="mt-4 space-y-4 lg:mt-0 lg:sticky lg:top-16">
      <MissionPollsPanel
        locale={locale}
        missionId={mission.id}
        polls={polls}
        options={pollOptions}
        votes={pollVotes}
        results={pollResults}
        profiles={profiles}
        userId={userId}
        canVote={isSpaceEditor && !isArchived}
        canClose={(p) =>
          p.created_by === userId || isDecisionMaker || isAdminLike
        }
        canDelete={(p) => p.created_by === userId || isAdminLike}
        enabled={pollsEnabled}
        isArchived={isArchived}
      />

      <MissionStartReminderPanel
        locale={locale}
        mission={mission}
        enabled={startReminderEnabled}
        canEdit={canEditMeta}
        isArchived={isArchived}
      />

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-slate-500">
          {t(locale, "priorityDecisionSection")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">
              {t(locale, "priority")}
            </span>
            <select
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
              disabled={pending || !canEditMeta || isArchived}
              value={mission.priority ?? "none"}
              onChange={(e) => {
                const v = e.target.value;
                const next: MissionPriority | null =
                  v === "high" || v === "medium" || v === "low" ? v : null;
                run(() => updateMissionPriorityAction(mission.id, next));
              }}
            >
              <option value="high">{t(locale, "priorityHigh")}</option>
              <option value="medium">{t(locale, "priorityMedium")}</option>
              <option value="low">{t(locale, "priorityLow")}</option>
              <option value="none">{t(locale, "priorityNone")}</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">
              {t(locale, "decisionMaker")}
            </span>
            <select
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
              disabled={pending || !canEditMeta || isArchived}
              value={mission.decision_maker_id ?? ""}
              onChange={(e) => {
                const next = e.target.value || null;
                run(() => updateMissionDecisionMakerAction(mission.id, next));
              }}
            >
              <option value="">{t(locale, "decisionMakerNone")}</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {profiles[m.user_id]?.display_name || m.user_id.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {mission.decision_maker_id && (
          <div className="mt-4 space-y-2 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200/80">
            {decisionApproved ? (
              <p className="text-sm font-medium text-emerald-700">
                {t(locale, "decisionApproved")}
                {mission.decision_approved_by
                  ? ` · ${
                      profiles[mission.decision_approved_by]?.display_name ||
                      mission.decision_approved_by.slice(0, 8)
                    }`
                  : ""}
              </p>
            ) : awaitingDecision ? (
              <p className="text-sm font-medium text-violet-700">
                {t(locale, "decisionPending")}
              </p>
            ) : (
              <p className="text-sm text-slate-600">
                {t(locale, "decisionNotRequested")}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {isDecisionMaker && !decisionApproved && (
                <>
                  <button
                    type="button"
                    disabled={pending || isArchived}
                    onClick={() =>
                      run(() => approveMissionDecisionAction(mission.id))
                    }
                    className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    {t(locale, "decisionApprove")}
                  </button>
                  {awaitingDecision && (
                    <button
                      type="button"
                      disabled={pending || isArchived}
                      onClick={() =>
                        run(() => returnMissionDecisionAction(mission.id))
                      }
                      className="rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200"
                    >
                      {t(locale, "decisionReturn")}
                    </button>
                  )}
                </>
              )}
              {!isDecisionMaker &&
                !decisionApproved &&
                mission.decision_maker_id &&
                !isArchived && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(() => requestMissionDecisionAction(mission.id))
                    }
                    className="rounded-xl bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    {awaitingDecision
                      ? t(locale, "decisionRequestAgain")
                      : t(locale, "decisionRequest")}
                  </button>
                )}
            </div>
            <p className="text-[11px] text-slate-400">
              {t(locale, "decisionMakerHint")}
            </p>
          </div>
        )}
      </section>

      <MissionRecurrencePanel
        locale={locale}
        missionId={mission.id}
        startDate={mission.start_date}
        recurrence={recurrence}
        isTemplate={
          !recurrence ||
          !mission.recurrence_id ||
          recurrence.template_mission_id === mission.id
        }
        canEdit={canEditMeta}
        isArchived={isArchived}
      />

        </aside>
      </div>

      {panel && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          onClick={() => setPanel(null)}
        >
          <div
            className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-xl"
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
                      {formatDateTime(row.at, locale)}
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
