export type SpaceRole = "owner" | "admin" | "member";
export type MissionStatus = "todo" | "inProgress" | "done";
/** 029: high | medium | low | null (= none). New tasks default to medium on create. */
export type MissionPriority = "high" | "medium" | "low";
export type Locale = "zh-Hant" | "zh-Hans" | "en" | "ja" | "ko";

export type SpaceWithRole = {
  id: string;
  name: string;
  invite_code: string;
  archived_at: string | null;
  role: SpaceRole;
};

export type MissionRow = {
  id: string;
  space_id: string;
  title: string;
  description: string;
  start_date: string | null;
  due_date: string | null;
  status: MissionStatus;
  flag_icon: string;
  creator_id: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  /** 029 — may be missing if migration not applied. */
  priority?: MissionPriority | null;
  decision_maker_id?: string | null;
  decision_requested_at?: string | null;
  decision_requested_by?: string | null;
  decision_approved_at?: string | null;
  decision_approved_by?: string | null;
  /** 031 — may be missing if migration not applied. */
  recurrence_id?: string | null;
  /** 030 — start clock + reminder lead; may be missing if migration not applied. */
  start_time_minutes?: number | null;
  start_timezone?: string | null;
  /** null = recipient default; 0 = off; 15 | 60 | 1440 */
  start_reminder_minutes?: number | null;
};

export type StartReminderMinutes = 0 | 15 | 60 | 1440;

export type UserNotificationPreferencesRow = {
  user_id: string;
  mission_due_today?: boolean;
  mission_due_soon?: boolean;
  step_claimed?: boolean;
  step_completed?: boolean;
  step_assigned_to_me?: boolean;
  new_comment?: boolean;
  mission_created?: boolean;
  mission_status_changed?: boolean;
  join_request_pending?: boolean;
  join_request_resolved?: boolean;
  member_joined?: boolean;
  member_kicked?: boolean;
  shift_reminder_enabled?: boolean;
  shift_reminder_minutes?: number;
  shift_swap_pending?: boolean;
  step_claim_approval_pending?: boolean;
  locale?: string;
  mission_decision?: boolean;
  mission_start_reminder?: boolean;
  mission_start_reminder_minutes?: number;
  task_poll_announcement?: boolean;
  space_announcement?: boolean;
  /** 037 — morning-of when step deadline is today */
  step_deadline_reminder?: boolean;
};

export type ShiftReminderMinutes = 15 | 30 | 60 | 120 | 360 | 720 | 1440;

export type MissionStepRow = {
  id: string;
  mission_id: string;
  title: string;
  order_index: number;
  is_done: boolean;
  assignee_id: string | null;
  deadline_date: string | null;
  created_at: string;
  completed_at: string | null;
  /** 033 — null = top level; may be missing if migration not applied. */
  parent_step_id?: string | null;
};

export type MissionCommentRow = {
  id: string;
  mission_id: string;
  step_id: string | null;
  author_id: string;
  body: string;
  created_at: string;
};

export type ProfileRow = {
  id: string;
  display_name: string;
  avatar_url: string | null;
};

export type SpaceMemberRow = {
  space_id: string;
  user_id: string;
  role: SpaceRole;
  nickname: string | null;
  joined_at: string;
};

export type JoinRequestRow = {
  id: string;
  space_id: string;
  requester_id: string;
  status: "pending" | "accepted" | "declined";
  created_at: string;
};

export type MissionReaderRow = {
  mission_id: string;
  user_id: string;
  read_at: string;
};

export type MissionWorkerRow = {
  mission_id: string;
  user_id: string;
  started_at: string;
};

export type ActivityEventRow = {
  id: string;
  space_id: string;
  actor_id: string | null;
  kind: string;
  mission_id: string | null;
  step_id: string | null;
  summary: string;
  created_at: string;
};

export type StepClaimRequestRow = {
  id: string;
  mission_id: string;
  step_id: string;
  requester_id: string;
  status: "pending" | "accepted" | "declined" | "cancelled";
  created_at: string;
  resolved_at: string | null;
};

export type ShiftSource = "manual" | "generated" | "swap";
export type ShiftStatus = "scheduled" | "cancelled";

export type ShiftRow = {
  id: string;
  space_id: string;
  user_id: string;
  start_at: string;
  end_at: string;
  title: string | null;
  note: string | null;
  color: string;
  text_color: string;
  template_id: string | null;
  source: ShiftSource;
  status: ShiftStatus;
  created_at: string;
  updated_at: string;
  /** 011: batch id for rotation generate undo; may be missing if 011 not applied. */
  generation_batch_id?: string | null;
};

export type ShiftTemplateRow = {
  id: string;
  space_id: string;
  created_by: string;
  name: string;
  default_start_minutes: number;
  default_end_minutes: number;
  color: string;
  text_color: string;
  created_at: string;
  updated_at: string;
  /** 028: personal owner; null = shared. May be missing if 028 not applied. */
  owner_user_id?: string | null;
};

export type LeaveDayFraction = 0.25 | 0.5 | 0.75 | 1;

export type LeaveEntryRow = {
  id: string;
  space_id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  day_fraction: number;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type ShiftSwapKind = "cover" | "swap";
export type ShiftSwapStatus = "pending" | "accepted" | "declined" | "cancelled";
export type ShiftSwapApprovalMode = "admin_required" | "peer_accept";

export type ShiftSwapRequestRow = {
  id: string;
  space_id: string;
  shift_id: string;
  requester_id: string;
  target_user_id: string;
  kind: ShiftSwapKind;
  counter_shift_id: string | null;
  note: string | null;
  status: ShiftSwapStatus;
  created_at: string;
  resolved_at: string | null;
  /** 027: target agreed in admin_required mode; may be missing if 027 not applied. */
  target_accepted_at?: string | null;
};

/** 031: daily | weekly | monthly | interval */
export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "interval";

export type MissionRecurrenceRow = {
  id: string;
  space_id: string;
  template_mission_id: string | null;
  created_by: string;
  frequency: RecurrenceFrequency;
  interval_days: number | null;
  /** ISO weekdays 1=Mon … 7=Sun */
  weekdays: number[];
  month_day: number | null;
  time_minutes: number;
  timezone: string;
  start_on: string;
  end_on: string | null;
  max_count: number | null;
  generated_count: number;
  next_run_at: string | null;
  last_run_at: string | null;
  active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type RecurrenceEndMode = "never" | "onDate" | "afterCount";

/** 032 — in-task polls */
export type MissionPollRow = {
  id: string;
  mission_id: string;
  space_id: string;
  created_by: string;
  question: string;
  allow_multiple: boolean;
  anonymous: boolean;
  deadline_at: string | null;
  closed_at: string | null;
  closed_by: string | null;
  final_option_ids: string[];
  created_at: string;
};

export type MissionPollOptionRow = {
  id: string;
  poll_id: string;
  position: number;
  label: string;
};

export type MissionPollVoteRow = {
  poll_id: string;
  option_id: string;
  user_id: string;
  created_at?: string;
};

export type MissionPollResultRow = {
  poll_id: string;
  option_id: string;
  vote_count: number;
  voter_count: number;
};

/** 032/034 — mission_id null = space-level (034) */
export type MissionAnnouncementRow = {
  id: string;
  mission_id: string | null;
  space_id: string;
  author_id: string;
  body: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
  /** 034 — optional headline for space announcements */
  title?: string | null;
};

export type MissionAnnouncementReadRow = {
  announcement_id: string;
  user_id: string;
  read_at?: string;
};

export type AnnouncementDismissalRow = {
  announcement_id: string;
  user_id: string;
  dismissed_at?: string;
};
