"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import {
  classifyLinkGoogleError,
  type LinkGoogleErrorCode,
} from "@/lib/link-google-errors";
import { t, tf } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

function providerLabel(locale: Locale, provider: string): string {
  const key = provider.toLowerCase();
  if (key === "google") return t(locale, "identityProviderGoogle");
  if (key === "apple") return t(locale, "identityProviderApple");
  if (key === "email") return t(locale, "identityProviderEmail");
  return provider;
}

export function LinkedIdentitiesPanel({
  locale,
  providers,
  linkOk,
  linkError,
}: {
  locale: Locale;
  /** Distinct providers from GoTrue `user.identities` (not profiles.auth_provider). */
  providers: string[];
  linkOk?: boolean;
  linkError?: LinkGoogleErrorCode | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const hasGoogle = useMemo(
    () => providers.some((p) => p.toLowerCase() === "google"),
    [providers]
  );

  const banner = useMemo(() => {
    if (linkOk) {
      return { kind: "ok" as const, text: t(locale, "linkGoogleSuccess") };
    }
    if (linkError === "manual") {
      return {
        kind: "err" as const,
        text: t(locale, "linkGoogleManualLinkingDisabled"),
      };
    }
    if (linkError === "taken") {
      return {
        kind: "err" as const,
        text: t(locale, "linkGoogleIdentityTaken"),
      };
    }
    if (linkError === "failed") {
      return {
        kind: "err" as const,
        text: t(locale, "linkGoogleFailedRetry"),
      };
    }
    return null;
  }, [locale, linkOk, linkError]);

  async function onLinkGoogle() {
    setLocalError(null);
    if (!isSupabaseConfigured()) {
      setLocalError(t(locale, "envMissing"));
      return;
    }
    setBusy(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLocalError(t(locale, "loginFailed"));
        setBusy(false);
        return;
      }
      // Same callback as sign-in OAuth; next lands back on settings with link=ok.
      // Must use linkIdentity (not signInWithOAuth) so Google binds to this session.
      const redirectTo = new URL("/auth/callback", window.location.origin);
      redirectTo.searchParams.set("next", "/app/settings?link=ok#account");
      redirectTo.searchParams.set("flow", "link");
      const { error } = await supabase.auth.linkIdentity({
        provider: "google",
        options: {
          redirectTo: redirectTo.toString(),
        },
      });
      if (error) {
        const code = classifyLinkGoogleError(
          [error.message, (error as { code?: string }).code]
            .filter(Boolean)
            .join(" ")
        );
        if (code === "manual") {
          setLocalError(t(locale, "linkGoogleManualLinkingDisabled"));
        } else if (code === "taken") {
          setLocalError(t(locale, "linkGoogleIdentityTaken"));
        } else {
          setLocalError(
            tf(locale, "linkGoogleFailed", {
              detail: error.message || String(error),
            })
          );
        }
        setBusy(false);
        return;
      }
      // Browser navigates to Google; if not, refresh in case SDK handled inline.
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const code = classifyLinkGoogleError(msg);
      if (code === "manual") {
        setLocalError(t(locale, "linkGoogleManualLinkingDisabled"));
      } else if (code === "taken") {
        setLocalError(t(locale, "linkGoogleIdentityTaken"));
      } else {
        setLocalError(tf(locale, "linkGoogleFailed", { detail: msg }));
      }
      setBusy(false);
    }
  }

  return (
    <div className="mb-6 border-b border-slate-100 pb-5">
      <h3 className="text-sm font-semibold text-slate-800">
        {t(locale, "linkedIdentitiesTitle")}
      </h3>
      <p className="mt-1 text-[11px] text-slate-400">
        {t(locale, "linkGoogleAccountHint")}
      </p>

      {providers.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          {t(locale, "linkedIdentitiesEmpty")}
        </p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-2">
          {providers.map((p) => (
            <li
              key={p}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700"
            >
              {providerLabel(locale, p)}
            </li>
          ))}
        </ul>
      )}

      {!hasGoogle && (
        <button
          type="button"
          disabled={busy}
          onClick={onLinkGoogle}
          className="mt-4 flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
        >
          <svg aria-hidden className="h-4 w-4" viewBox="0 0 24 24">
            <path
              fill="#EA4335"
              d="M12 10.2v3.6h5.1c-.2 1.2-.9 2.2-1.9 2.9l3.1 2.4c1.8-1.7 2.8-4.1 2.8-7 0-.7-.1-1.3-.2-1.9H12z"
            />
            <path
              fill="#34A853"
              d="M6.6 14.3l-.8.6-2.7 2.1C4.8 19.7 8.1 22 12 22c2.7 0 5-.9 6.7-2.4l-3.1-2.4c-.9.6-2 .9-3.6.9-2.8 0-5.1-1.9-5.9-4.4z"
            />
            <path
              fill="#4A90E2"
              d="M3.1 7c-.6 1.2-1 2.5-1 4s.4 2.8 1 4l3.5-2.7c-.2-.6-.3-1.2-.3-1.3s.1-.7.3-1.3L3.1 7z"
            />
            <path
              fill="#FBBC05"
              d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.8-2.8C16.9 2.9 14.7 2 12 2 8.1 2 4.8 4.3 3.1 7l3.5 2.7C7 7.8 9.2 5.9 12 5.9z"
            />
          </svg>
          {busy ? t(locale, "linkGoogleBusy") : t(locale, "linkGoogleAccount")}
        </button>
      )}

      {banner && (
        <p
          className={`mt-3 rounded-xl px-3 py-2 text-sm ${
            banner.kind === "ok"
              ? "bg-emerald-50 text-emerald-800"
              : "bg-red-50 text-red-700"
          }`}
        >
          {banner.text}
        </p>
      )}
      {localError && (
        <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {localError}
        </p>
      )}
    </div>
  );
}
