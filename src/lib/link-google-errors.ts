/**
 * Map GoTrue / OAuth errors from identity **link** (not sign-in) to stable codes.
 * Mirrors Android `LinkGoogleErrors` / iOS `mapLinkGoogleError`.
 */
export type LinkGoogleErrorCode = "manual" | "taken" | "failed";

export function classifyLinkGoogleError(
  raw: string | null | undefined
): LinkGoogleErrorCode {
  const lower = (raw ?? "").toLowerCase();
  if (
    (lower.includes("manual") && lower.includes("link")) ||
    lower.includes("linking is disabled") ||
    lower.includes("manual linking") ||
    (lower.includes("not enabled") && lower.includes("link"))
  ) {
    return "manual";
  }
  if (
    lower.includes("identity_already_exists") ||
    lower.includes("already been linked") ||
    lower.includes("already linked") ||
    lower.includes("identity is already linked") ||
    (lower.includes("email") &&
      (lower.includes("exists") ||
        lower.includes("registered") ||
        lower.includes("taken")))
  ) {
    return "taken";
  }
  return "failed";
}

/** Short codes safe for query strings. */
export function linkErrorQueryValue(code: LinkGoogleErrorCode): string {
  return code;
}

export function parseLinkErrorQuery(
  value: string | null | undefined
): LinkGoogleErrorCode | null {
  if (value === "manual" || value === "taken" || value === "failed") return value;
  return null;
}
