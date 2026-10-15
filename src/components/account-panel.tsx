"use client";

import { useState, useTransition } from "react";
import { deleteAccountAction, signOutAction } from "@/app/actions/auth";
import { t, tf } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

export function AccountPanel({ locale }: { locale: Locale }) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const expected = t(locale, "deleteAccountConfirmPhrase");

  function onDelete() {
    setError(null);
    if (phrase.trim() !== expected) {
      setError(t(locale, "deleteAccountPhraseMismatch"));
      return;
    }
    startTransition(async () => {
      const res = await deleteAccountAction();
      if (res?.error === "owns_shared_spaces") {
        setError(t(locale, "deleteAccountOwnsSharedSpaces"));
      } else if (res?.error) {
        setError(res.error);
      }
      // success redirects to /login
    });
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold tracking-wide text-slate-500">
        {t(locale, "accountSection")}
      </h2>
      <p className="mt-1 text-[11px] text-slate-400">
        {t(locale, "meAccountDetails")}
      </p>

      <form action={signOutAction} className="mt-4">
        <button
          type="submit"
          className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          {t(locale, "logout")}
        </button>
      </form>

      <div className="mt-6 border-t border-slate-100 pt-4">
        {!confirming ? (
          <button
            type="button"
            onClick={() => {
              setConfirming(true);
              setPhrase("");
              setError(null);
            }}
            className="h-10 rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 hover:bg-red-100"
          >
            {t(locale, "deleteAccount")}
          </button>
        ) : (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-red-800">
              {t(locale, "deleteAccountConfirmTitle")}
            </h3>
            <p className="text-sm text-slate-600">
              {t(locale, "deleteAccountConfirmMessage")}
            </p>
            <p className="text-sm font-medium text-slate-700">
              {tf(locale, "deleteAccountTypePrompt", { phrase: expected })}
            </p>
            <input
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              disabled={pending}
              autoComplete="off"
              className="h-10 w-full max-w-md rounded-xl border border-slate-200 px-3 text-sm"
            />
            {error && (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={onDelete}
                className="h-10 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
              >
                {pending
                  ? t(locale, "deleteAccountInProgress")
                  : t(locale, "deleteAccountConfirmAction")}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setConfirming(false);
                  setPhrase("");
                  setError(null);
                }}
                className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700"
              >
                {t(locale, "cancel")}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
