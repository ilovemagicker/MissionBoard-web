"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { t, tf, type MessageKey } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

const STORAGE_KEY = "missionBoard.onboarding.v1.dismissed";

type Step = {
  titleKey: MessageKey;
  bodyKey: MessageKey;
  ctaKey: MessageKey;
  href: string;
};

const STEPS: Step[] = [
  {
    titleKey: "onboardingSpacesTitle",
    bodyKey: "onboardingSpacesBody",
    ctaKey: "onboardingSpacesCta",
    href: "/app/spaces",
  },
  {
    titleKey: "onboardingMissionsTitle",
    bodyKey: "onboardingMissionsBody",
    ctaKey: "onboardingMissionsCta",
    href: "/app/missions",
  },
  {
    titleKey: "onboardingScheduleTitle",
    bodyKey: "onboardingScheduleBody",
    ctaKey: "onboardingScheduleCta",
    href: "/app/schedule",
  },
  {
    titleKey: "onboardingSettingsTitle",
    bodyKey: "onboardingSettingsBody",
    ctaKey: "onboardingSettingsCta",
    href: "/app/settings",
  },
];

function hasInviteOrFamilyQuery(): boolean {
  if (typeof window === "undefined") return false;
  const q = new URLSearchParams(window.location.search);
  return Boolean(q.get("invite") || q.get("family"));
}

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDismissed() {
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* private mode / quota */
  }
}

/**
 * First-run tour for authenticated app shell.
 * Skip/Done persist dismissal; hidden when ?invite= or ?family= is present.
 */
export function OnboardingTour({ locale }: { locale: Locale }) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (hasInviteOrFamilyQuery()) return;
    if (readDismissed()) return;
    setOpen(true);
  }, []);

  const dismiss = useCallback(() => {
    writeDismissed();
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        dismiss();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open, dismiss]);

  if (!open) return null;

  const total = STEPS.length;
  const current = STEPS[step]!;
  const isLast = step >= total - 1;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
      role="presentation"
      onClick={dismiss}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="w-full max-w-md outline-none rounded-3xl bg-white p-5 shadow-xl ring-1 ring-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
              {t(locale, "onboardingTitle")}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {tf(locale, "onboardingStepOf", {
                current: step + 1,
                total,
              })}
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100"
          >
            {t(locale, "onboardingSkip")}
          </button>
        </div>

        <div className="mb-4 flex gap-1.5" aria-hidden>
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full ${
                i <= step ? "bg-blue-600" : "bg-slate-200"
              }`}
            />
          ))}
        </div>

        <h2
          id={titleId}
          className="text-lg font-bold text-slate-900"
        >
          {t(locale, current.titleKey)}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          {t(locale, current.bodyKey)}
        </p>

        <Link
          href={current.href}
          onClick={dismiss}
          className="mt-4 inline-flex text-sm font-semibold text-blue-600 hover:text-blue-700"
        >
          {t(locale, current.ctaKey)} →
        </Link>

        <div className="mt-6 flex items-center justify-end gap-2">
          {!isLast ? (
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(s + 1, total - 1))}
              className="h-10 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
            >
              {t(locale, "onboardingNext")}
            </button>
          ) : (
            <button
              type="button"
              onClick={dismiss}
              className="h-10 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
            >
              {t(locale, "onboardingDone")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
