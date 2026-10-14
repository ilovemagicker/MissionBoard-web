/** 030 start-time reminder helpers (missions.start_* + prefs). */

export const START_REMINDER_OPTIONS = [0, 15, 60, 1440] as const;
export type StartReminderOption = (typeof START_REMINDER_OPTIONS)[number];
export const DEFAULT_PREF_REMINDER_MINUTES = 60;

/** Parse form value: "" | "default" → null; "0"|"15"|"60"|"1440" → number. */
export function parseStartReminderMinutes(
  raw: string | null | undefined
): number | null {
  const v = String(raw ?? "").trim();
  if (!v || v === "default" || v === "null") return null;
  const n = Number(v);
  if (n === 0 || n === 15 || n === 60 || n === 1440) return n;
  return null;
}

/** "HH:MM" → 0–1439, or null if empty/invalid. */
export function parseStartTimeMinutes(
  raw: string | null | undefined
): number | null {
  const v = String(raw ?? "").trim();
  if (!v) return null;
  const [hRaw, mRaw] = v.split(":");
  const h = Number(hRaw);
  const min = Number(mRaw);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

export function minutesToTimeInput(minutes: number): string {
  const m = Math.min(1439, Math.max(0, Math.floor(minutes)));
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function deviceTimezone(): string {
  try {
    return (
      Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Hong_Kong"
    );
  } catch {
    return "Asia/Hong_Kong";
  }
}

/**
 * Approximate local wall-clock when the push would fire:
 * start_date + start_time − lead (when lead is a concrete per-task value).
 * Returns null when reminder is off, uses recipient default, or inputs incomplete.
 */
export function estimateReminderLocalLabel(
  startDate: string | null | undefined,
  startTimeMinutes: number | null | undefined,
  startReminderMinutes: number | null | undefined
): string | null {
  if (!startDate || startTimeMinutes == null) return null;
  if (startReminderMinutes == null || startReminderMinutes === 0) return null;
  const [y, mo, d] = startDate.split("-").map(Number);
  if (!y || !mo || !d) return null;
  const start = new Date(
    y,
    mo - 1,
    d,
    Math.floor(startTimeMinutes / 60),
    startTimeMinutes % 60,
    0,
    0
  );
  const fire = new Date(start.getTime() - startReminderMinutes * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${fire.getFullYear()}-${pad(fire.getMonth() + 1)}-${pad(fire.getDate())} ${pad(fire.getHours())}:${pad(fire.getMinutes())}`;
}
