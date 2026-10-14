import { AppShell } from "@/components/app-shell";
import { SpacesClient } from "@/components/spaces-client";
import { normalizeShareCode } from "@/lib/deep-links";
import { createClient } from "@/lib/supabase/server";
import {
  getActiveSpaceId,
  getLocale,
  getSession,
  getSpacesForUser,
} from "@/lib/session";
import type { JoinRequestRow, ProfileRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SpacesPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string; family?: string; code?: string }>;
}) {
  const locale = await getLocale();
  const { user, configured } = await getSession();
  if (!configured || !user) return null;

  const sp = await searchParams;
  const initialInvite = normalizeShareCode(sp.invite || sp.code);
  const initialFamily = normalizeShareCode(sp.family);
  // If someone passed a family code via invite/code, prefer family field.
  const familyPrefill =
    initialFamily ||
    (/^MB-FAM-/i.test(initialInvite) ? initialInvite : "");
  const invitePrefill =
    familyPrefill && initialInvite === familyPrefill ? "" : initialInvite;

  const activeSpaces = await getSpacesForUser(user.id);
  const spaces = await getSpacesForUser(user.id, { includeArchived: true });
  const activeSpaceId = await getActiveSpaceId(activeSpaces);
  const supabase = await createClient();

  const spaceIds = spaces.map((s) => s.id);
  const membersBySpace: Record<
    string,
    { user_id: string; role: string; nickname: string | null }[]
  > = {};
  const profiles: Record<string, ProfileRow> = {};
  let pendingRequests: (JoinRequestRow & { space_name?: string })[] = [];

  if (spaceIds.length > 0) {
    const { data: members } = await supabase
      .from("space_members")
      .select("space_id,user_id,role,nickname")
      .in("space_id", spaceIds);

    const userIds = new Set<string>();
    for (const m of members ?? []) {
      const sid = m.space_id as string;
      if (!membersBySpace[sid]) membersBySpace[sid] = [];
      membersBySpace[sid].push({
        user_id: m.user_id as string,
        role: m.role as string,
        nickname: (m.nickname as string | null) ?? null,
      });
      userIds.add(m.user_id as string);
    }

    const { data: requests } = await supabase
      .from("space_join_requests")
      .select("id,space_id,requester_id,status,created_at")
      .in("space_id", spaceIds)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    const nameById = new Map(spaces.map((s) => [s.id, s.name]));
    pendingRequests = ((requests as JoinRequestRow[]) ?? []).map((r) => {
      userIds.add(r.requester_id);
      return { ...r, space_name: nameById.get(r.space_id) };
    });

    if (userIds.size > 0) {
      const { data: profileRows } = await supabase
        .from("profiles")
        .select("id,display_name,avatar_url")
        .in("id", Array.from(userIds));
      for (const p of profileRows ?? []) {
        profiles[p.id as string] = p as ProfileRow;
      }
    }
  }

  return (
    <AppShell
      locale={locale}
      spaces={activeSpaces}
      activeSpaceId={activeSpaceId}
      email={user.email}
      nav="spaces"
    >
      <SpacesClient
        locale={locale}
        spaces={spaces}
        membersBySpace={membersBySpace}
        profiles={profiles}
        pendingRequests={pendingRequests}
        initialInvite={invitePrefill || undefined}
        initialFamilyCode={familyPrefill || undefined}
      />
    </AppShell>
  );
}
