"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  entitlementsFromRow,
  entitlementsForPlan,
  readDebugPlan,
  writeDebugPlan,
  type Entitlements,
  type Plan,
  type UserEntitlementRow,
} from "@/lib/entitlements";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

type EntitlementsContextValue = {
  entitlements: Entitlements;
  plan: Plan;
  isPro: boolean;
  ready: boolean;
  /** QA only: force Free/Pro via localStorage; pass null to clear and use DB. */
  setDebugPlan: (plan: Plan | null) => void;
  toggleDebugPlan: () => void;
  refresh: () => Promise<void>;
};

const EntitlementsContext = createContext<EntitlementsContextValue | null>(
  null
);

export function EntitlementsProvider({ children }: { children: ReactNode }) {
  const [dbEntitlements, setDbEntitlements] = useState<Entitlements | null>(
    null
  );
  const [debugPlan, setDebugPlanState] = useState<Plan | null>(null);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setDbEntitlements(entitlementsFromRow(null));
      setReady(true);
      return;
    }
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setDbEntitlements(entitlementsFromRow(null));
        setReady(true);
        return;
      }
      const { data, error } = await supabase
        .from("user_entitlements")
        .select(
          "user_id,is_pro_active,product_id,expires_at,original_transaction_id,source,updated_at"
        )
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) {
        // Table missing or RLS — fall back to free without blocking UI walls falsely...
        // ready stays true; spaces precheck treats null ents as unavailable when we pass null.
        // Here we still expose free defaults so badges render, but mark source null.
        console.warn("user_entitlements fetch failed", error.message);
        setDbEntitlements(entitlementsFromRow(null));
      } else {
        setDbEntitlements(
          entitlementsFromRow((data as UserEntitlementRow | null) ?? null)
        );
      }
    } catch (err) {
      console.warn("user_entitlements fetch error", err);
      setDbEntitlements(entitlementsFromRow(null));
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    setDebugPlanState(readDebugPlan());
    void load();
  }, [load]);

  const setDebugPlan = useCallback((plan: Plan | null) => {
    writeDebugPlan(plan);
    setDebugPlanState(plan);
  }, []);

  const toggleDebugPlan = useCallback(() => {
    const base = debugPlan ?? dbEntitlements?.plan ?? "free";
    const next: Plan = base === "free" ? "pro" : "free";
    setDebugPlan(next);
  }, [debugPlan, dbEntitlements?.plan, setDebugPlan]);

  const entitlements = useMemo(() => {
    if (debugPlan) {
      return entitlementsForPlan(debugPlan, {
        debugOverride: true,
        source: dbEntitlements?.source ?? null,
        expiresAt: dbEntitlements?.expiresAt ?? null,
        fetchedAt: dbEntitlements?.fetchedAt ?? Date.now(),
      });
    }
    return dbEntitlements ?? entitlementsFromRow(null);
  }, [debugPlan, dbEntitlements]);

  const value = useMemo(
    () => ({
      entitlements,
      plan: entitlements.plan,
      isPro: entitlements.plan === "pro",
      ready,
      setDebugPlan,
      toggleDebugPlan,
      refresh: load,
    }),
    [entitlements, ready, setDebugPlan, toggleDebugPlan, load]
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
