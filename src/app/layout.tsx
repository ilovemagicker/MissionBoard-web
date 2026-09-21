import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mission Board",
  description: "Spaces, missions, and steps — web client for Mission Board.",
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
