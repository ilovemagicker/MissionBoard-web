import { LoginForm } from "@/components/login-form";
import { sanitizeNextPath } from "@/lib/deep-links";
import { getLocale } from "@/lib/session";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const locale = await getLocale();
  const sp = await searchParams;
  const next = sanitizeNextPath(sp.next);
  return <LoginForm locale={locale} next={next} authError={sp.error} />;
}
