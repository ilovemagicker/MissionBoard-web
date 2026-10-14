import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Work Assistants",
  description: "任務助理 — Spaces、任務、步驟與排班。與 iOS／Android 共用 Supabase。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant" suppressHydrationWarning>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
