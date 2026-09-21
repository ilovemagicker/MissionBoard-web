import type { Locale } from "@/lib/types";

export function dateLocale(locale: Locale): string {
  return locale === "en" ? "en-US" : "zh-HK";
}

/** Stable date+time for SSR/CSR — always pass app locale, never browser default. */
export function formatDateTime(iso: string | Date, locale: Locale): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(dateLocale(locale), {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(iso: string | Date, locale: Locale): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(dateLocale(locale), {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
