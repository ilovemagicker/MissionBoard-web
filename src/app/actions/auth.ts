"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config";
import { formatError } from "@/lib/errors";

export async function signOutAction() {
  if (!isSupabaseConfigured()) {
    redirect("/login");
  }
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * Calls the same Edge Function as mobile (`delete-account`).
 * Requires typing the confirm phrase on the client before invoke.
 */
export async function deleteAccountAction() {
  try {
    if (!isSupabaseConfigured()) throw new Error("Supabase not configured");
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data, error } = await supabase.functions.invoke("delete-account", {
      body: {},
    });

    if (error) {
      const msg = error.message || String(error);
      if (/owns_shared_spaces/i.test(msg)) {
        return { error: "owns_shared_spaces" as const };
      }
      throw error;
    }

    const payload = (data ?? {}) as {
      ok?: boolean;
      code?: string;
      error?: string;
    };
    if (payload.code === "owns_shared_spaces" || /owns_shared_spaces/i.test(payload.error || "")) {
      return { error: "owns_shared_spaces" as const };
    }
    if (payload.ok === false && payload.error) {
      return { error: payload.error };
    }

    await supabase.auth.signOut();
  } catch (err) {
    const msg = formatError(err);
    if (/owns_shared_spaces/i.test(msg)) {
      return { error: "owns_shared_spaces" as const };
    }
    return { error: msg };
  }
  redirect("/login");
}
