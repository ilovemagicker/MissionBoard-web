import type { Locale } from "@/lib/types";

export const LOCALE_COOKIE = "mb_locale";
export const DEFAULT_LOCALE: Locale = "zh-Hant";

const dict = {
  "zh-Hant": {
    appName: "Mission Board",
    missions: "任務",
    spaces: "空間",
    logout: "登出",
    login: "登入",
    signup: "註冊",
    language: "語言",
    activeSpace: "目前空間",
    noSpace: "尚未選擇空間",
    createMission: "建立任務",
    search: "搜尋",
    filterAll: "全部",
    filterActive: "進行中",
    filterDone: "已完成",
    statusTodo: "待辦",
    statusInProgress: "進行中",
    statusDone: "完成",
    title: "標題",
    description: "說明",
    startDate: "開始日",
    dueDate: "截止日",
    save: "儲存",
    cancel: "取消",
    create: "建立",
    steps: "步驟",
    addStep: "新增步驟",
    comments: "留言",
    addComment: "送出留言",
    working: "我要進行中",
    stopWorking: "取消進行中",
    claim: "認領",
    unclaim: "取消認領",
    assign: "指派",
    unassigned: "未指派",
    members: "成員",
    createSpace: "建立空間",
    joinSpace: "加入空間",
    inviteCode: "邀請碼",
    pendingRequests: "待審申請",
    accept: "同意",
    decline: "拒絕",
    roleOwner: "擁有者",
    roleAdmin: "管理員",
    roleMember: "成員",
    noMissions: "這個空間還沒有任務",
    noSpaces: "你還沒有空間，建立一個或用邀請碼加入。",
    envMissing: "尚未設定 Supabase：請在 .env.local 填入 URL 與 anon key。",
    back: "返回",
    switchSpace: "切換空間",
    submitJoin: "送出申請",
    loading: "載入中…",
    error: "發生錯誤",
    markDone: "完成",
    markTodo: "未完成",
  },
  en: {
    appName: "Mission Board",
    missions: "Missions",
    spaces: "Spaces",
    logout: "Log out",
    login: "Sign in",
    signup: "Sign up",
    language: "Language",
    activeSpace: "Active space",
    noSpace: "No space selected",
    createMission: "New mission",
    search: "Search",
    filterAll: "All",
    filterActive: "Active",
    filterDone: "Done",
    statusTodo: "To do",
    statusInProgress: "In progress",
    statusDone: "Done",
    title: "Title",
    description: "Description",
    startDate: "Start date",
    dueDate: "Due date",
    save: "Save",
    cancel: "Cancel",
    create: "Create",
    steps: "Steps",
    addStep: "Add step",
    comments: "Comments",
    addComment: "Post comment",
    working: "I'm working",
    stopWorking: "Stop working",
    claim: "Claim",
    unclaim: "Unclaim",
    assign: "Assign",
    unassigned: "Unassigned",
    members: "Members",
    createSpace: "Create space",
    joinSpace: "Join space",
    inviteCode: "Invite code",
    pendingRequests: "Pending requests",
    accept: "Accept",
    decline: "Decline",
    roleOwner: "Owner",
    roleAdmin: "Admin",
    roleMember: "Member",
    noMissions: "No missions in this space yet",
    noSpaces: "You have no spaces yet. Create one or join with an invite code.",
    envMissing: "Supabase is not configured. Add URL and anon key to .env.local.",
    back: "Back",
    switchSpace: "Switch space",
    submitJoin: "Request to join",
    loading: "Loading…",
    error: "Something went wrong",
    markDone: "Done",
    markTodo: "Not done",
  },
} as const;

export type MessageKey = keyof (typeof dict)["zh-Hant"];

export function t(locale: Locale, key: MessageKey): string {
  return dict[locale][key] ?? dict["zh-Hant"][key] ?? key;
}

export function parseLocale(value: string | undefined | null): Locale {
  return value === "en" ? "en" : "zh-Hant";
}

export function statusLabel(locale: Locale, status: string): string {
  if (status === "todo") return t(locale, "statusTodo");
  if (status === "inProgress") return t(locale, "statusInProgress");
  if (status === "done") return t(locale, "statusDone");
  return status;
}

export function roleLabel(locale: Locale, role: string): string {
  if (role === "owner") return t(locale, "roleOwner");
  if (role === "admin") return t(locale, "roleAdmin");
  if (role === "member") return t(locale, "roleMember");
  return role;
}
