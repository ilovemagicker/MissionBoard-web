"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateNotificationPrefsAction,
  type NotificationPrefsInput,
} from "@/app/actions/prefs";
import { t, type MessageKey } from "@/lib/i18n";
import type { Locale, ShiftReminderMinutes, UserNotificationPreferencesRow } from "@/lib/types";

const SHIFT_OPTS: ShiftReminderMinutes[] = [15, 30, 60, 120, 360, 720, 1440];

function bool(v: boolean | undefined, fallback: boolean) {
  return v === undefined ? fallback : !!v;
}

type ToggleDef = {
  key: keyof NotificationPrefsInput;
  label: MessageKey;
  defaultOn: boolean;
};

const MISSION_TOGGLES: ToggleDef[] = [
  { key: "mission_due_today", label: "notifPrefMissionDueToday", defaultOn: true },
  { key: "mission_due_soon", label: "notifPrefMissionDueSoon", defaultOn: true },
  { key: "mission_status_changed", label: "notifPrefMissionStatusChanged", defaultOn: false },
  { key: "mission_created", label: "notifPrefMissionCreated", defaultOn: true },
  { key: "task_poll_announcement", label: "notifPrefTaskPollAnnouncement", defaultOn: true },
  { key: "space_announcement", label: "notifPrefSpaceAnnouncement", defaultOn: true },
  { key: "mission_start_reminder", label: "notifPrefMissionStartReminder", defaultOn: true },
];

const STEP_TOGGLES: ToggleDef[] = [
  { key: "step_claimed", label: "notifPrefStepClaimed", defaultOn: true },
  { key: "step_completed", label: "notifPrefStepCompleted", defaultOn: true },
  { key: "step_assigned_to_me", label: "notifPrefStepAssignedToMe", defaultOn: true },
  { key: "step_claim_approval_pending", label: "notifPrefStepClaimApprovalPending", defaultOn: true },
  { key: "step_deadline_reminder", label: "notifPrefStepDeadlineReminder", defaultOn: true },
];

const COMMENT_TOGGLES: ToggleDef[] = [
  { key: "new_comment", label: "notifPrefNewComment", defaultOn: true },
];

const TEAM_TOGGLES: ToggleDef[] = [
  { key: "join_request_pending", label: "notifPrefJoinRequestPending", defaultOn: true },
  { key: "join_request_resolved", label: "notifPrefJoinRequestResolved", defaultOn: true },
  { key: "member_joined", label: "notifPrefMemberJoined", defaultOn: true },
  { key: "member_kicked", label: "notifPrefMemberKicked", defaultOn: false },
];

const SCHEDULE_TOGGLES: ToggleDef[] = [
  { key: "shift_swap_pending", label: "notifPrefShiftSwapPending", defaultOn: true },
  { key: "shift_reminder_enabled", label: "notifPrefShiftReminder", defaultOn: true },
];

function prefsToState(p: UserNotificationPreferencesRow | null): NotificationPrefsInput {
  const startM = p?.mission_start_reminder_minutes;
  const shiftM = p?.shift_reminder_minutes;
  return {
    mission_due_today: bool(p?.mission_due_today, true),
    mission_due_soon: bool(p?.mission_due_soon, true),
    step_claimed: bool(p?.step_claimed, true),
    step_completed: bool(p?.step_completed, true),
    step_assigned_to_me: bool(p?.step_assigned_to_me, true),
    new_comment: bool(p?.new_comment, true),
    mission_created: bool(p?.mission_created, true),
    mission_status_changed: bool(p?.mission_status_changed, false),
    join_request_pending: bool(p?.join_request_pending, true),
    join_request_resolved: bool(p?.join_request_resolved, true),
    member_joined: bool(p?.member_joined, true),
    member_kicked: bool(p?.member_kicked, false),
    shift_reminder_enabled: bool(p?.shift_reminder_enabled, true),
    shift_reminder_minutes: (SHIFT_OPTS.includes(shiftM as ShiftReminderMinutes)
      ? shiftM
      : 60) as number,
    shift_swap_pending: bool(p?.shift_swap_pending, true),
    step_claim_approval_pending: bool(p?.step_claim_approval_pending, true),
    mission_start_reminder: bool(p?.mission_start_reminder, true),
    mission_start_reminder_minutes:
      startM === 15 || startM === 60 || startM === 1440 ? startM : 60,
    task_poll_announcement: bool(p?.task_poll_announcement, true),
    space_announcement: bool(p?.space_announcement, true),
    step_deadline_reminder: bool(p?.step_deadline_reminder, true),
  };
}

function shiftLabel(locale: Locale, m: number): string {
  if (m === 15) return t(locale, "startReminder15");
  if (m === 30) return t(locale, "shiftReminder30");
  if (m === 60) return t(locale, "startReminder60");
  if (m === 120) return t(locale, "shiftReminder120");
  if (m === 360) return t(locale, "shiftReminder360");
  if (m === 720) return t(locale, "shiftReminder720");
  if (m === 1440) return t(locale, "startReminder1440");
  return `${m}`;
}

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-5 border-t border-slate-100 pt-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

export function NotificationPrefsPanel({
  locale,
  enabled,
  prefs,
}: {
  locale: Locale;
  enabled: boolean;
  prefs: UserNotificationPreferencesRow | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState(() => prefsToState(prefs));

  if (!enabled) return null;

  function setToggle(key: keyof NotificationPrefsInput, value: boolean) {
    setState((s) => ({ ...s, [key]: value }));
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await updateNotificationPrefsAction(state);
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  function renderToggles(list: ToggleDef[]) {
    return list.map((d) => (
      <label
        key={d.key}
        className="flex items-center gap-2 text-sm font-medium text-slate-800"
      >
        <input
          type="checkbox"
          checked={!!state[d.key]}
          disabled={pending}
          onChange={(e) => setToggle(d.key, e.target.checked)}
          className="h-4 w-4"
        />
        {t(locale, d.label)}
      </label>
    ));
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold tracking-wide text-slate-500">
        {t(locale, "notificationsSection")}
      </h2>
      <p className="mt-1 text-[11px] text-slate-400">
        {t(locale, "notifPrefsWebHint")}
      </p>
      {error && (
        <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <Group title={t(locale, "notifGroupMissions")}>
        {renderToggles(MISSION_TOGGLES)}
        {state.mission_start_reminder && (
          <label className="mt-2 block text-sm">
            <span className="mb-1 block font-medium text-slate-700">
              {t(locale, "notifPrefMissionStartReminderLead")}
            </span>
            <select
              value={state.mission_start_reminder_minutes}
              disabled={pending}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  mission_start_reminder_minutes: Number(e.target.value) as
                    | 15
                    | 60
                    | 1440,
                }))
              }
              className="h-10 w-full max-w-xs rounded-xl border border-slate-200 bg-white px-3 text-sm"
            >
              <option value={15}>{t(locale, "startReminder15")}</option>
              <option value={60}>{t(locale, "startReminder60")}</option>
              <option value={1440}>{t(locale, "startReminder1440")}</option>
            </select>
          </label>
        )}
      </Group>

      <Group title={t(locale, "notifGroupSteps")}>
        {renderToggles(STEP_TOGGLES)}
        <p className="text-[11px] text-slate-400">
          {t(locale, "notifStepDeadlineHint")}
        </p>
      </Group>

      <Group title={t(locale, "notifGroupComments")}>
        {renderToggles(COMMENT_TOGGLES)}
      </Group>

      <Group title={t(locale, "notifGroupTeam")}>
        {renderToggles(TEAM_TOGGLES)}
      </Group>

      <Group title={t(locale, "notifGroupSchedule")}>
        {renderToggles(SCHEDULE_TOGGLES)}
        {state.shift_reminder_enabled && (
          <label className="mt-2 block text-sm">
            <span className="mb-1 block font-medium text-slate-700">
              {t(locale, "notifShiftReminderLead")}
            </span>
            <select
              value={state.shift_reminder_minutes}
              disabled={pending}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  shift_reminder_minutes: Number(e.target.value),
                }))
              }
              className="h-10 w-full max-w-xs rounded-xl border border-slate-200 bg-white px-3 text-sm"
            >
              {SHIFT_OPTS.map((m) => (
                <option key={m} value={m}>
                  {shiftLabel(locale, m)}
                </option>
              ))}
            </select>
          </label>
        )}
      </Group>

      <button
        type="button"
        disabled={pending}
        onClick={save}
        className="mt-5 h-10 rounded-xl bg-brand px-4 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
      >
        {pending ? t(locale, "loading") : t(locale, "save")}
      </button>
    </section>
  );
}
