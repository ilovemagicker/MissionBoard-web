import { AccountPanel } from "@/components/account-panel";
import { McpTokensPanel } from "@/components/mcp-tokens-panel";
import { AppShell } from "@/components/app-shell";
import { NotificationPrefsPanel } from "@/components/notification-prefs-panel";
import { PlanQuotaView } from "@/components/monetization/plan-quota-view";
import { ProfilePanel } from "@/components/profile-panel";
import { createClient } from "@/lib/supabase/server";
import { isSchemaMissingError } from "@/lib/errors";
import { t } from "@/lib/i18n";
import {
  getActiveSpaceId,
  getLocale,
  getSession,
  getSpacesForUser,
} from "@/lib/session";
import type { UserNotificationPreferencesRow } from "@/lib/types";
import { listMcpTokensAction } from "@/app/actions/mcp-tokens";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const locale = await getLocale();
  const { user, configured } = await getSession();
  if (!configured || !user) return null;

  const spaces = await getSpacesForUser(user.id);
  const activeSpaceId = await getActiveSpaceId(spaces);
  // Free/Pro space limit counts owned spaces only (022); invited memberships do not count.
  const spacesUsed = spaces.filter((s) => s.role === "owner" && !s.archived_at).length;

  let membersUsed = 0;
  let prefs: UserNotificationPreferencesRow | null = null;
  let prefsSchemaOk = true;
  let displayName = "";
  let avatarUrl: string | null = null;
  let authProvider: string | null = null;

  const supabase = await createClient();
  if (activeSpaceId) {
    const { count } = await supabase
      .from("space_members")
      .select("user_id", { count: "exact", head: true })
      .eq("space_id", activeSpaceId);
    membersUsed = count ?? 0;
  }

  {
    const { data, error } = await supabase
      .from("user_notification_preferences")
      .select(
        [
          "user_id",
          "mission_due_today",
          "mission_due_soon",
          "step_claimed",
          "step_completed",
          "step_assigned_to_me",
          "new_comment",
          "mission_created",
          "mission_status_changed",
          "join_request_pending",
          "join_request_resolved",
          "member_joined",
          "member_kicked",
          "shift_reminder_enabled",
          "shift_reminder_minutes",
          "shift_swap_pending",
          "step_claim_approval_pending",
          "locale",
          "mission_start_reminder",
          "mission_start_reminder_minutes",
          "task_poll_announcement",
          "space_announcement",
          "step_deadline_reminder",
        ].join(",")
      )
      .eq("user_id", user.id)
      .maybeSingle();
    if (error && isSchemaMissingError(error)) {
      // Fallback: try core columns only
      const { data: core, error: err2 } = await supabase
        .from("user_notification_preferences")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (err2 && isSchemaMissingError(err2)) {
        prefsSchemaOk = false;
      } else if (core) {
        prefs = core as unknown as UserNotificationPreferencesRow;
      }
    } else if (data) {
      prefs = data as unknown as UserNotificationPreferencesRow;
    }
  }

  {
    const { data } = await supabase
      .from("profiles")
      .select("display_name,avatar_url,auth_provider")
      .eq("id", user.id)
      .maybeSingle();
    if (data) {
      displayName = (data.display_name as string) || "";
      avatarUrl = (data.avatar_url as string | null) ?? null;
      authProvider = (data.auth_provider as string | null) ?? null;
    }
    if (!displayName) {
      displayName =
        (user.user_metadata?.full_name as string | undefined) ||
        (user.user_metadata?.name as string | undefined) ||
        user.email?.split("@")[0] ||
        "";
    }
    if (!authProvider) {
      authProvider =
        (user.app_metadata?.provider as string | undefined) ||
        (user.app_metadata?.providers as string[] | undefined)?.[0] ||
        null;
    }
  }

  const mcpTokensRes = await listMcpTokensAction();
  const mcpTokens = mcpTokensRes.tokens ?? [];

  return (
    <AppShell
      locale={locale}
      spaces={spaces}
      activeSpaceId={activeSpaceId}
      email={user.email}
      nav="settings"
    >
      <div className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          {t(locale, "meTitle")}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {t(locale, "mePageSubtitle")}
        </p>
      </div>

      <div className="lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-8 lg:items-start">
        <nav className="mb-4 flex flex-wrap gap-1 lg:mb-0 lg:sticky lg:top-16 lg:flex-col">
          {[
            { id: "profile", label: t(locale, "profileSection") },
            { id: "plan", label: t(locale, "monPlanQuotaTitle") },
            { id: "notifications", label: t(locale, "notificationsSection") },
            { id: "mcp", label: t(locale, "mcpSection") },
            { id: "account", label: t(locale, "accountSection") },
          ].map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="rounded-md px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="space-y-4">
          <div id="profile">
            <ProfilePanel
              locale={locale}
              displayName={displayName}
              avatarUrl={avatarUrl}
              email={user.email ?? null}
              authProvider={authProvider}
            />
          </div>

          <div id="plan">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t(locale, "monPlanQuotaTitle")}
            </h2>
            <PlanQuotaView
              locale={locale}
              spacesUsed={spacesUsed}
              membersUsed={membersUsed}
            />
          </div>

          <div id="notifications">
            <NotificationPrefsPanel
              locale={locale}
              enabled={prefsSchemaOk}
              prefs={prefs}
            />
          </div>

          <div id="mcp">
            <McpTokensPanel locale={locale} tokens={mcpTokens} />
          </div>

          <div id="account">
            <AccountPanel locale={locale} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
