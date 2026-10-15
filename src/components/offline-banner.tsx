"use client";

import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

/**
 * Top banner when the browser reports offline.
 * Auto-clears on `online`; dismissible while still offline.
 * Mount once in the root layout so app shell + login both see it.
 */
export function OfflineBanner({ locale }: { locale: Locale }) {
  const [offline, setOffline] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    function sync() {
      const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
      setOffline(isOffline);
      if (!isOffline) setDismissed(false);
    }
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  if (!offline || dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-50 border-b border-amber-200/90 bg-amber-50 px-4 py-2.5 text-sm text-amber-950 shadow-sm"
    >
      <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between gap-3">
        <p className="font-medium leading-snug">{t(locale, "offlineBanner")}</p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100"
          aria-label={t(locale, "offlineBannerDismiss")}
        >
          {t(locale, "offlineBannerDismiss")}
        </button>
      </div>
    </div>
  );
}
