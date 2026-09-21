"use client";

import { useState } from "react";
import { useEntitlements } from "@/components/entitlements-provider";
import { PlanBadge } from "@/components/monetization/plan-badge";
import { PaywallModal } from "@/components/monetization/paywall-modal";
import type { Locale } from "@/lib/types";

/**
 * Lightweight Free/Pro badge for app shell header.
 * Free taps → paywall; Pro is display-only.
 */
export function HeaderPlanBadge({ locale }: { locale: Locale }) {
  const { plan, isPro, ready } = useEntitlements();
  const [showPaywall, setShowPaywall] = useState(false);

  if (!ready) {
    return (
      <span className="inline-flex h-5 w-10 animate-pulse rounded-full bg-slate-200" />
    );
  }

  return (
    <>
      <PlanBadge
        plan={plan}
        interactive={!isPro}
        onClick={!isPro ? () => setShowPaywall(true) : undefined}
      />
      <PaywallModal
        locale={locale}
        open={showPaywall}
        onClose={() => setShowPaywall(false)}
        context="settings"
      />
    </>
  );
}
