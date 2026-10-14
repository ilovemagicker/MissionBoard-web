"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  ensureScheduleShareCodeAction,
  rotateScheduleShareCodeAction,
} from "@/app/actions/schedule-share";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

export function ScheduleSharePanel({
  locale,
  spaceId,
  spaceName,
  onClose,
}: {
  locale: Locale;
  spaceId: string;
  spaceName: string;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadCode = useCallback(() => {
    setError(null);
    setOkMsg(null);
    startTransition(async () => {
      const res = await ensureScheduleShareCodeAction(spaceId);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.code) setCode(res.code);
    });
  }, [spaceId]);

  useEffect(() => {
    loadCode();
  }, [loadCode]);

  function onRotate() {
    if (!window.confirm(t(locale, "scheduleShareRotateConfirm"))) return;
    setError(null);
    setOkMsg(null);
    setCopied(false);
    startTransition(async () => {
      const res = await rotateScheduleShareCodeAction(spaceId);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.code) {
        setCode(res.code);
        setOkMsg(t(locale, "scheduleShareRotated"));
      }
    });
  }

  async function onCopy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setOkMsg(t(locale, "scheduleShareCopied"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(t(locale, "scheduleShareCopyFailed"));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-3xl bg-white p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              {t(locale, "scheduleShareTitle")}
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              {t(locale, "scheduleShareHint").replace("{space}", spaceName)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-3 py-1.5 text-sm font-semibold text-slate-500 hover:bg-slate-100"
          >
            {t(locale, "cancel")}
          </button>
        </div>

        <div className="mt-5 rounded-2xl bg-slate-50 px-4 py-4 ring-1 ring-slate-200">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {t(locale, "scheduleShareCodeLabel")}
          </p>
          {code ? (
            <p className="mt-2 break-all font-mono text-xl font-bold tracking-wider text-slate-900">
              {code}
            </p>
          ) : (
            <p className="mt-2 text-sm text-slate-500">
              {pending ? t(locale, "loading") : "—"}
            </p>
          )}
        </div>

        {error ? (
          <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        ) : null}
        {okMsg ? (
          <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            {okMsg}
          </p>
        ) : null}

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            disabled={pending || !code}
            onClick={() => void onCopy()}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-indigo-600 px-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {copied
              ? t(locale, "scheduleShareCopied")
              : t(locale, "scheduleShareCopy")}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onRotate}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-3 text-sm font-semibold text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-60"
          >
            {t(locale, "scheduleShareRotate")}
          </button>
        </div>

        <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
          {t(locale, "scheduleShareNote")}
        </p>
      </div>
    </div>
  );
}
