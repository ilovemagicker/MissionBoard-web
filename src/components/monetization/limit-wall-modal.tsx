"use client";

import { useState } from "react";
import { PLAN_COMPARE, type LimitKind } from "@/lib/entitlements";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/types";
import { PaywallModal } from "@/components/monetization/paywall-modal";

export function LimitWallModal({
  locale,
  kind,
  open,
  onClose,
}: {
  locale: Locale;
  kind: LimitKind | null;
  open: boolean;
  onClose: () => void;
}) {
  const [showPaywall, setShowPaywall] = useState(false);

  if (!open || !kind) return null;

  const isSpace = kind.type === "spaceLimit";
  const isOwner =
    kind.type === "memberLimit" ? kind.viewerRole === "owner" : true;
  const showsUpgrade = isSpace || isOwner;

  const title = isSpace
    ? t(locale, "monSpaceLimitTitle")
    : isOwner
      ? t(locale, "monMemberLimitOwnerTitle")
      : t(locale, "monMemberLimitJoinerTitle");

  const reason = isSpace
    ? t(locale, "monSpaceLimitReason")
    : isOwner
      ? t(locale, "monMemberLimitOwnerReason")
      : t(locale, "monMemberLimitJoinerReason");

  const freeLimit = isSpace
    ? PLAN_COMPARE.spaces.free
    : PLAN_COMPARE.members.free;
  const proLimit = isSpace
    ? PLAN_COMPARE.spaces.pro
    : PLAN_COMPARE.members.pro;

  const paywallContext = isSpace ? "spaceLimit" : "memberLimit";

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
        role="dialog"
        aria-modal="true"
        aria-labelledby="limit-wall-title"
        onClick={onClose}
      >
        <div
          className="w-full max-w-md rounded-3xl bg-white p-5 shadow-xl ring-1 ring-slate-200"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xl text-orange-500" aria-hidden>
              ⚠
            </span>
            <h2
              id="limit-wall-title"
              className="text-lg font-bold text-slate-900"
            >
              {title}
            </h2>
          </div>

          <p className="text-sm leading-relaxed text-slate-600">{reason}</p>

          <div className="mt-4 flex items-center gap-3">
            <QuotaPill label="Free" value={`≤${freeLimit}`} />
            <span className="text-slate-300">→</span>
            <QuotaPill label="Pro" value={`≤${proLimit}`} />
          </div>

          {showsUpgrade ? (
            <button
              type="button"
              onClick={() => setShowPaywall(true)}
              className="mt-5 flex h-11 w-full items-center justify-center rounded-xl bg-blue-600 text-sm font-semibold text-white"
            >
              {t(locale, "monUpgradePro")}
            </button>
          ) : (
            <p className="mt-4 text-xs text-slate-500">
              {t(locale, "monAskOwnerToUpgrade")}
            </p>
          )}

          <button
            type="button"
            onClick={onClose}
            className="mt-2 flex h-10 w-full items-center justify-center rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700"
          >
            {t(locale, "monClose")}
          </button>
        </div>
      </div>

      <PaywallModal
        locale={locale}
        open={showPaywall}
        onClose={() => setShowPaywall(false)}
        context={paywallContext}
      />
    </>
  );
}

function QuotaPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-100 px-3 py-2 text-center">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="text-sm font-bold text-slate-800">{value}</div>
    </div>
  );
}
