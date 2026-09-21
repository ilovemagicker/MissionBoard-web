"use client";

import { useState } from "react";
import { useEntitlements } from "@/components/entitlements-provider";
import { PlanBadge } from "@/components/monetization/plan-badge";
import { QuotaMeterRow } from "@/components/monetization/quota-meter-row";
import { PaywallModal } from "@/components/monetization/paywall-modal";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

export function PlanQuotaView({
  locale,
  spacesUsed,
  membersUsed,
}: {
  locale: Locale;
  spacesUsed: number;
  membersUsed: number;
}) {
  const { entitlements, isPro, plan, togglePlan } = useEntitlements();
  const [showPaywall, setShowPaywall] = useState(false);

  return (
    <div className="space-y-4">
      <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-500">
            {t(locale, "monCurrentPlan")}
          </h2>
          <PlanBadge plan={plan} />
        </div>
        <p className="mt-3 text-[11px] text-slate-400">
          {t(locale, "monAssumedPriceNote")}
        </p>
      </section>

      <section className="space-y-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80">
        <h2 className="text-sm font-semibold text-slate-500">
          {t(locale, "monQuotaSection")}
        </h2>
        <QuotaMeterRow
          title={t(locale, "monQuotaSpaces")}
          used={spacesUsed}
          limit={entitlements.maxSpaces}
        />
        <QuotaMeterRow
          title={t(locale, "monQuotaMembers")}
          used={membersUsed}
          limit={entitlements.maxMembersPerSpace}
          footnote={t(locale, "monQuotaMembersFootnote")}
        />
        <QuotaMeterRow
          title={t(locale, "monQuotaAI")}
          used={entitlements.aiQuotaUsed}
          limit={entitlements.aiQuotaLimit}
          footnote={t(locale, "monQuotaAIFootnote")}
        />
      </section>

      <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80">
        {isPro ? (
          <button
            type="button"
            onClick={() => setShowPaywall(true)}
            className="flex h-11 w-full items-center justify-center rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-800"
          >
            {t(locale, "monManagePlan")}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setShowPaywall(true)}
            className="flex h-11 w-full items-center justify-center rounded-xl bg-blue-600 text-sm font-semibold text-white"
          >
            {t(locale, "monUpgradePro")}
          </button>
        )}
      </section>

      <section className="rounded-3xl bg-amber-50/80 p-5 ring-1 ring-amber-200/80">
        <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700">
          DEBUG
        </p>
        <p className="mt-1 text-xs text-amber-800">
          {t(locale, "monDebugPlanHint")}
        </p>
        <button
          type="button"
          onClick={togglePlan}
          className="mt-3 h-9 rounded-xl bg-white px-4 text-xs font-semibold text-slate-700 ring-1 ring-slate-200"
        >
          {t(locale, "monDebugTogglePlan")} ({plan})
        </button>
      </section>

      <PaywallModal
        locale={locale}
        open={showPaywall}
        onClose={() => setShowPaywall(false)}
        context="settings"
      />
    </div>
  );
}
