import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config";
import { DEFAULT_LOCALE, LOCALE_COOKIE, parseLocale } from "@/lib/i18n";
import type { Locale, SpaceWithRole } from "@/lib/types";
import type { User } from "@supabase/supabase-js";

export const ACTIVE_SPACE_COOKIE = "mb_active_space";

export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  return parseLocale(cookieStore.get(LOCALE_COOKIE)?.value) || DEFAULT_LOCALE;
}

export async function getSession(): Promise<{
  user: User | null;
  configured: boolean;
}> {
  if (!isSupabaseConfigured()) {
    return { user: null, configured: false };
  }
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return { user, configured: true };
  } catch {
    return { user: null, configured: false };
  }
}

export async function getSpacesForUser(
  userId: string,
  opts?: { includeArchived?: boolean }
): Promise<SpaceWithRole[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();

  const { data: memberships, error } = await supabase
    .from("space_members")
    .select("space_id, role")
    .eq("user_id", userId);

  if (error || !memberships?.length) return [];

  const spaceIds = memberships.map((m) => m.space_id as string);
  const roleBySpace = new Map(
    memberships.map((m) => [m.space_id as string, m.role as SpaceWithRole["role"]])
  );

  let query = supabase
    .from("spaces")
    .select("id, name, invite_code, archived_at")
    .in("id", spaceIds)
    .order("name");

  if (!opts?.includeArchived) {
    query = query.is("archived_at", null);
  }

  const { data: spaces } = await query;

  return (spaces ?? []).map((s) => ({
    id: s.id as string,
    name: s.name as string,
    invite_code: s.invite_code as string,
    archived_at: (s.archived_at as string | null) ?? null,
    role: roleBySpace.get(s.id as string) ?? "member",
  }));
}

export async function getActiveSpaceId(
  spaces: SpaceWithRole[]
): Promise<string | null> {
  if (spaces.length === 0) return null;
  const cookieStore = await cookies();
  const raw = cookieStore.get(ACTIVE_SPACE_COOKIE)?.value;
  if (raw && spaces.some((s) => s.id === raw)) return raw;
  return spaces[0].id;
}

export async function requireUser() {
  const { user, configured } = await getSession();
  return { user, configured };
}
