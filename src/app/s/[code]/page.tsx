import { redirect } from "next/navigation";
import { normalizeShareCode } from "@/lib/deep-links";

/**
 * Short alias for family share codes: `/s/MB-FAM-xxxx`
 * Space invite codes are sent to `/join?code=`.
 */
export default async function ShortSharePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: raw } = await params;
  const code = normalizeShareCode(decodeURIComponent(raw || ""));
  if (!code) {
    redirect("/join/family");
  }
  if (/^MB-FAM-/i.test(code)) {
    redirect(`/join/family?code=${encodeURIComponent(code)}`);
  }
  redirect(`/join?code=${encodeURIComponent(code)}`);
}
