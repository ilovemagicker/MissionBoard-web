export type SpaceRole = "owner" | "admin" | "member";
export type MissionStatus = "todo" | "inProgress" | "done";
export type Locale = "zh-Hant" | "en";

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
};

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
