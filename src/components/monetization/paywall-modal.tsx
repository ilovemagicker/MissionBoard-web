"use client";

import { useState } from "react";
import { PLAN_COMPARE, PRO_PRICE_LABEL } from "@/lib/entitlements";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/types";
import { useEntitlements } from "@/components/entitlements-provider";
import { PlanBadge } from "@/components/monetization/plan-badge";

export type PaywallContext = "settings" | "spaceLimit" | "memberLimit";

export function PaywallModal({
  locale,
  open,
  onClose,
  context = "settings",
}: {
  locale: Locale;
  open: boolean;
  onClose: () => void;
  context?: PaywallContext;
}) {
  const { isPro, entitlements } = useEntitlements();
  const [checkingOut, setCheckingOut] = useState(false);
  const [comingSoon, setComingSoon] = useState(false);

  if (!open) return null;

  async function runCheckoutStub() {
    setCheckingOut(true);
    await new Promise((r) => setTimeout(r, 200));
    setCheckingOut(false);
    setComingSoon(true);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="paywall-title"
      data-paywall-context={context}
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-5 shadow-xl ring-1 ring-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id="paywall-title" className="text-lg font-bold text-slate-900">
            {t(locale, "monPaywallTitle")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100"
          >
            {t(locale, "monClose")}
          </button>
        </div>

        {isPro ? (
          <div className="space-y-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200/80">
            <PlanBadge plan="pro" />
            <p className="text-base font-bold text-slate-900">
              {t(locale, "monAlreadyPro")}
            </p>
            <p className="text-sm text-slate-500">
              {t(locale, "monManagePlanStub")}
            </p>
            <button
              type="button"
              onClick={() => setComingSoon(true)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-800"
            >
              {t(locale, "monManagePlan")}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <section className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200/80">
              <h3 className="mb-3 text-sm font-semibold text-slate-800">
                {t(locale, "monCompareTitle")}
              </h3>
              <CompareRow
                title={t(locale, "monQuotaSpaces")}
                free={`${PLAN_COMPARE.spaces.free}`}
                pro={`${PLAN_COMPARE.spaces.pro}`}
              />
              <CompareRow
                title={t(locale, "monQuotaMembers")}
                free={`${PLAN_COMPARE.members.free}`}
                pro={`${PLAN_COMPARE.members.pro}`}
              />
              <CompareRow
                title={t(locale, "monQuotaAI")}
                free={PLAN_COMPARE.ai.free}
                pro={PLAN_COMPARE.ai.pro}
              />
            </section>

            <section className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200/80">
              <h3 className="text-sm font-semibold text-slate-800">
                {t(locale, "monPriceTitle")}
              </h3>
              <p className="mt-1 text-2xl font-bold text-slate-900">
                {entitlements.proPriceLabel || PRO_PRICE_LABEL}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {t(locale, "monAssumedPriceNote")}
              </p>
            </section>

            <section className="space-y-2">
              <button
                type="button"
                disabled={checkingOut}
                onClick={runCheckoutStub}
                className="flex h-11 w-full items-center justify-center rounded-xl bg-blue-600 text-sm font-semibold text-white disabled:opacity-60"
              >
                {checkingOut ? t(locale, "loading") : t(locale, "monCheckoutCTA")}
              </button>
              <p className="text-[11px] text-slate-400">
                {t(locale, "monCheckoutStubNote")}
              </p>
            </section>
          </div>
        )}

        {comingSoon && (
          <div className="mt-4 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
            <p className="text-sm font-semibold text-amber-900">
              {t(locale, "monComingSoonTitle")}
            </p>
            <p className="mt-1 text-xs text-amber-800">
              {t(locale, "monComingSoonMessage")}
            </p>
            <button
              type="button"
              onClick={() => setComingSoon(false)}
              className="mt-3 h-9 w-full rounded-xl bg-white text-xs font-semibold text-slate-700 ring-1 ring-slate-200"
            >
              {t(locale, "monClose")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CompareRow({
  title,
  free,
  pro,
}: {
  title: string;
  free: string;
  pro: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 text-sm">
      <span className="text-slate-700">{title}</span>
      <span className="flex gap-3 text-xs">
        <span className="font-medium text-slate-500">Free {free}</span>
        <span className="font-bold text-orange-600">Pro {pro}</span>
      </span>
    </div>
  );
}

