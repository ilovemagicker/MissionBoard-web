/**
 * Web deep-link helpers: sanitize post-login `next`, parse schedule `ym`,
 * and build shareable join URLs for space invites / family schedule codes.
 */

const DEFAULT_NEXT = "/app/missions";

/** Safe internal path (+ optional query) for post-login redirect. */
export function sanitizeNextPath(
  raw: string | null | undefined,
  fallback: string = DEFAULT_NEXT
): string {
  if (!raw) return fallback;
  let value = raw.trim();
  try {
    value = decodeURIComponent(value);
  } catch {
    /* keep raw */
  }
  value = value.trim();
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return fallback;
  if (value.includes("\\")) return fallback;
  // Disallow auth callback loops and login as destination
  const pathOnly = value.split("?")[0] ?? value;
  if (pathOnly === "/login" || pathOnly.startsWith("/auth/")) return fallback;
  return value;
}

/** Build absolute-or-relative next from pathname + search (including `?`). */
export function pathWithSearch(pathname: string, search: string): string {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (!search || search === "?") return path;
  return `${path}${search.startsWith("?") ? search : `?${search}`}`;
}

/** YYYY-MM → calendar month, or null if invalid. */
export function parseYm(
  raw: string | null | undefined
): { year: number; monthIndex: number } | null {
  if (!raw) return null;
  const m = /^(\d{4})-(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isFinite(year) || month < 1 || month > 12) return null;
  return { year, monthIndex: month - 1 };
}

export function formatYm(date: Date): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${mo}`;
}

/** Normalize invite / family codes for forms and URLs. */
export function normalizeShareCode(raw: string | null | undefined): string {
  return (raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

export function isFamilyShareCode(code: string): boolean {
  return /^MB-FAM-[A-Z0-9]+$/i.test(normalizeShareCode(code));
}

/** Public deep link for space invite (MB-xxxx-xxxx). */
export function spaceInviteDeepLink(code: string): string {
  const c = normalizeShareCode(code);
  return `/join?code=${encodeURIComponent(c)}`;
}

/** Public deep link for family schedule share (MB-FAM-xxxx). */
export function familyShareDeepLink(code: string): string {
  const c = normalizeShareCode(code);
  return `/join/family?code=${encodeURIComponent(c)}`;
}

/** Short alias → same as family share. */
export function familyShareShortDeepLink(code: string): string {
  const c = normalizeShareCode(code);
  return `/s/${encodeURIComponent(c)}`;
}

/** After auth, land on spaces with code prefilled. */
export function spacesInviteAppPath(code: string): string {
  return `/app/spaces?invite=${encodeURIComponent(normalizeShareCode(code))}`;
}

export function spacesFamilyAppPath(code: string): string {
  return `/app/spaces?family=${encodeURIComponent(normalizeShareCode(code))}`;
}
