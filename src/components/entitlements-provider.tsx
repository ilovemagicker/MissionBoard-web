"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  entitlementsForPlan,
  readDebugPlan,
  writeDebugPlan,
  type Entitlements,
  type Plan,
} from "@/lib/entitlements";

type EntitlementsContextValue = {
  entitlements: Entitlements;
  plan: Plan;
  isPro: boolean;
  ready: boolean;
  setPlan: (plan: Plan) => void;
  togglePlan: () => void;
};

const EntitlementsContext = createContext<EntitlementsContextValue | null>(
  null
);

const listeners = new Set<() => void>();
let cachedPlan: Plan | null = null;

function emit() {
  listeners.forEach((l) => l());
}

function getClientPlan(): Plan {
  if (cachedPlan == null) {
    cachedPlan = readDebugPlan() ?? "free";
  }
  return cachedPlan;
}

function getServerPlan(): Plan {
  return "free";
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function commitPlan(next: Plan) {
  cachedPlan = next;
  writeDebugPlan(next);
  emit();
}

export function EntitlementsProvider({ children }: { children: ReactNode }) {
  const plan = useSyncExternalStore(subscribe, getClientPlan, getServerPlan);

  const setPlan = useCallback((next: Plan) => {
    commitPlan(next);
  }, []);

  const togglePlan = useCallback(() => {
    const current = getClientPlan();
    commitPlan(current === "free" ? "pro" : "free");
  }, []);

  const entitlements = useMemo(() => entitlementsForPlan(plan), [plan]);

  const value = useMemo(
    () => ({
      entitlements,
      plan,
      isPro: plan === "pro",
      ready: true,
      setPlan,
      togglePlan,
    }),
    [entitlements, plan, setPlan, togglePlan]
  );

  return (
    <EntitlementsContext.Provider value={value}>
      {children}
    </EntitlementsContext.Provider>
  );
}

export function useEntitlements(): EntitlementsContextValue {
  const ctx = useContext(EntitlementsContext);
  if (!ctx) {
    throw new Error("useEntitlements must be used within EntitlementsProvider");
  }
  return ctx;
}
