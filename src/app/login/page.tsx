import { LoginForm } from "@/components/login-form";
import { getLocale } from "@/lib/session";

export default async function LoginPage() {
  const locale = await getLocale();
  return <LoginForm locale={locale} />;
}
