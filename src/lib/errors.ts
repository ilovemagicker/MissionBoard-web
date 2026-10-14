export function formatError(err: unknown, fallback = "Something went wrong"): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string" && m) return m;
  }
  return fallback;
}

export function isSchemaMissingError(err: unknown): boolean {
  const msg = formatError(err).toLowerCase();
  return (
    msg.includes("does not exist") ||
    msg.includes("could not find the table") ||
    msg.includes("could not find the function") ||
    msg.includes("schema cache") ||
    msg.includes("42p01") ||
    msg.includes("42703") ||
    msg.includes("pgrst205") ||
    msg.includes("pgrst202")
  );
}
