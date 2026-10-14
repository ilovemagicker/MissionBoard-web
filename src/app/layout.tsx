import type { Metadata } from "next";
import { getLocale } from "@/lib/session";
import "./globals.css";

export const metadata: Metadata = {
  title: "Work Assistants",
  description: "任務助理 — Spaces、任務、步驟與排班。與 iOS／Android 共用 Supabase。",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
