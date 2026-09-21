/**
 * Mock entitlements aligned with iOS EntitlementsService.
 * Free by default; localStorage debug toggle can force Pro for testing.
 * No real billing — checkout is a stub.
 */

export type Plan = "free" | "pro";

export type ViewerRole = "owner" | "joiner";

export type LimitKind =
  | { type: "spaceLimit" }
  | { type: "memberLimit"; viewerRole: ViewerRole };

export type PrecheckResult =
  | { status: "allowed" }
  | { status: "blocked"; kind: LimitKind }
  | { status: "unavailable" };

export type Entitlements = {
  plan: Plan;
  maxSpaces: number;
  maxMembersPerSpace: number;
  aiQuotaLimit: number;
  aiQuotaUsed: number;
  /** Assumed Pro price for UI copy (待驗證). */
  proPriceLabel: string;
  fetchedAt: number;
};

export const ENTITLEMENTS_STORAGE_KEY = "mb_debug_plan";
export const PRO_PRICE_LABEL = "HK$59/月";

export function freeEntitlements(fetchedAt = Date.now()): Entitlements {
  return {
    plan: "free",
    maxSpaces: 1,
    maxMembersPerSpace: 5,
    aiQuotaLimit: 20,
    aiQuotaUsed: 12,
    proPriceLabel: PRO_PRICE_LABEL,
    fetchedAt,
  };
}

export function proEntitlements(fetchedAt = Date.now()): Entitlements {
  return {
    plan: "pro",
    maxSpaces: 20,
    maxMembersPerSpace: 25,
    aiQuotaLimit: 300,
    aiQuotaUsed: 12,
    proPriceLabel: PRO_PRICE_LABEL,
    fetchedAt,
  };
}

export function entitlementsForPlan(plan: Plan): Entitlements {
  return plan === "pro" ? proEntitlements() : freeEntitlements();
}

export function readDebugPlan(): Plan | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ENTITLEMENTS_STORAGE_KEY);
    if (raw === "pro" || raw === "free") return raw;
  } catch {
    /* ignore */
  }
  return null;
}

export function writeDebugPlan(plan: Plan): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ENTITLEMENTS_STORAGE_KEY, plan);
  } catch {
    /* ignore */
  }
}

export function precheckCreateSpace(
  ents: Entitlements | null,
  currentSpaceCount: number
): PrecheckResult {
  if (!ents) return { status: "unavailable" };
  if (currentSpaceCount >= ents.maxSpaces) {
    return { status: "blocked", kind: { type: "spaceLimit" } };
  }
  return { status: "allowed" };
}

export function precheckAcceptMember(
  ents: Entitlements | null,
  currentMemberCount: number,
  viewerIsOwner: boolean
): PrecheckResult {
  if (!ents) return { status: "unavailable" };
  if (currentMemberCount >= ents.maxMembersPerSpace) {
    return {
      status: "blocked",
      kind: {
        type: "memberLimit",
        viewerRole: viewerIsOwner ? "owner" : "joiner",
      },
    };
  }
  return { status: "allowed" };
}

/** Free vs Pro comparison limits for wall/paywall copy. */
export const PLAN_COMPARE = {
  spaces: { free: 1, pro: 20 },
  members: { free: 5, pro: 25 },
  ai: { free: "~20", pro: "~300" },
} as const;
