/** Minutes from midnight [0, 1439] → "HH:MM" for <input type="time">. */
export function minutesToTimeInput(minutes: number): string {
  const m = Math.min(1439, Math.max(0, Math.floor(minutes)));
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** "HH:MM" or "HH:MM:SS" → minutes from midnight. */
export function timeInputToMinutes(value: string): number {
  const [hRaw, mRaw] = value.split(":");
  const h = Number(hRaw);
  const min = Number(mRaw);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return 0;
  return Math.min(1439, Math.max(0, h * 60 + min));
}

/**
 * Apply template clock times onto a local calendar day key (YYYY-MM-DD).
 * Overnight when end minutes < start; equal times → 24h so end > start.
 */
export function appliedRangeOnDay(
  dayKey: string,
  startMinutes: number,
  endMinutes: number
): { start: Date; end: Date } {
  const [y, mo, d] = dayKey.split("-").map(Number);
  const startM = Math.min(1439, Math.max(0, Math.floor(startMinutes)));
  const endM = Math.min(1439, Math.max(0, Math.floor(endMinutes)));
  const start = new Date(
    y,
    mo - 1,
    d,
    Math.floor(startM / 60),
    startM % 60,
    0,
    0
  );
  const endBase =
    endM < startM
      ? new Date(y, mo - 1, d + 1)
      : new Date(y, mo - 1, d);
  let end = new Date(
    endBase.getFullYear(),
    endBase.getMonth(),
    endBase.getDate(),
    Math.floor(endM / 60),
    endM % 60,
    0,
    0
  );
  if (end <= start) {
    end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  }
  return { start, end };
}

export function formatMinutesLabel(minutes: number): string {
  return minutesToTimeInput(minutes);
}
