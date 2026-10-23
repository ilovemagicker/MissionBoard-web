import type { Metadata } from "next";
import { OfflineBanner } from "@/components/offline-banner";
import { getLocale } from "@/lib/session";
import "./globals.css";

const siteUrl = "https://app.onyxlab.dev";
const title = "Work Assistants · Onyx Labs";
const description =
  "Work Assistants（任務助理）by Onyx Labs — team Spaces, missions, steps & shift scheduling. Web + iOS / Android.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  applicationName: "Work Assistants",
  authors: [{ name: "Onyx Labs", url: "https://onyxlab.dev" }],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "Onyx Labs",
    title,
    description,
    images: [
      {
        url: "https://onyxlab.dev/og-image.png",
        width: 1200,
        height: 630,
        alt: "Work Assistants by Onyx Labs",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["https://onyxlab.dev/og-image.png"],
  },
  icons: {
    icon: [{ url: "/favicon.png", sizes: "32x32", type: "image/png" }],
    apple: "/apple-touch-icon.png",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <OfflineBanner locale={locale} />
        {children}
      </body>
    </html>
  );
}
