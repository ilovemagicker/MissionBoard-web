"use client";

import type { Plan } from "@/lib/entitlements";

export function PlanBadge({
  plan,
  onClick,
  interactive = false,
}: {
  plan: Plan;
  onClick?: () => void;
  /** Free badge can be tappable; Pro is display-only by default. */
  interactive?: boolean;
}) {
  const isPro = plan === "pro";
  const className = `inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wide ${
    isPro
      ? "bg-orange-500 text-white"
      : "bg-slate-200 text-slate-600"
  } ${interactive && !isPro ? "cursor-pointer hover:bg-slate-300" : ""}`;

  if (interactive && !isPro && onClick) {
    return (
      <button type="button" onClick={onClick} className={className} aria-label="Free">
        Free
      </button>
    );
  }

  return (
    <span className={className} aria-label={isPro ? "Pro" : "Free"}>
      {isPro ? "Pro" : "Free"}
    </span>
  );
}
