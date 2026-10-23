/** Prompt-injection hygiene: treat tool args / mission text as data only. */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function truncate(value: unknown, max = 80): string | null {
  if (value == null) return null;
  const s = String(value);
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

/** Allowlisted summary for audit — no secrets, no long free text. */
export function summarizeArgs(
  tool: string,
  args: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (!args) return { tool };
  const out: Record<string, unknown> = { tool };
  for (const key of [
    "space_id",
    "mission_id",
    "status",
    "from",
    "to",
    "title",
  ]) {
    if (!(key in args)) continue;
    if (key === "title") {
      out.title_len = String(args.title ?? "").length;
    } else {
      out[key] = truncate(args[key], 64);
    }
  }
  return out;
}
