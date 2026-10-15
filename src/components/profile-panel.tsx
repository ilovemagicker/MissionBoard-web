"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProfileAction } from "@/app/actions/prefs";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

export function ProfilePanel({
  locale,
  displayName,
  avatarUrl,
  email,
  authProvider,
}: {
  locale: Locale;
  displayName: string;
  avatarUrl: string | null;
  email: string | null;
  authProvider: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(displayName);
  const [avatar, setAvatar] = useState(avatarUrl ?? "");

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await updateProfileAction({
        displayName: name,
        avatarUrl: avatar,
      });
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  const initials = (name || email || "?").trim().slice(0, 2).toUpperCase();

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold tracking-wide text-slate-500">
        {t(locale, "profileSection")}
      </h2>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatar}
            alt=""
            className="h-14 w-14 rounded-full object-cover ring-1 ring-slate-200"
          />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand/10 text-sm font-bold text-brand">
            {initials}
          </div>
        )}
        <div className="min-w-0 text-sm text-slate-600">
          {email && <p className="truncate font-medium text-slate-800">{email}</p>}
          {authProvider && (
            <p className="mt-0.5 text-xs text-slate-500">
              {t(locale, "signedInWith").replace("{provider}", authProvider)}
            </p>
          )}
        </div>
      </div>
      {error && (
        <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <label className="mt-4 block text-sm">
        <span className="mb-1 block font-medium text-slate-700">
          {t(locale, "displayName")}
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={pending}
          maxLength={80}
          placeholder={t(locale, "displayName")}
          className="h-10 w-full max-w-md rounded-xl border border-slate-200 px-3 text-sm"
        />
      </label>
      <label className="mt-3 block text-sm">
        <span className="mb-1 block font-medium text-slate-700">
          {t(locale, "avatarUrl")}
        </span>
        <input
          value={avatar}
          onChange={(e) => setAvatar(e.target.value)}
          disabled={pending}
          maxLength={500}
          placeholder="https://…"
          className="h-10 w-full max-w-md rounded-xl border border-slate-200 px-3 text-sm"
        />
        <span className="mt-1 block text-[11px] text-slate-400">
          {t(locale, "avatarUrlHint")}
        </span>
      </label>
      <button
        type="button"
        disabled={pending}
        onClick={save}
        className="mt-4 h-10 rounded-xl bg-brand px-4 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
      >
        {pending ? t(locale, "loading") : t(locale, "save")}
      </button>
    </section>
  );
}
