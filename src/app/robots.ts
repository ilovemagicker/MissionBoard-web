import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Thin authenticated app shells — prefer marketing pages on onyxlab.dev
      disallow: ["/app/", "/dashboard/", "/api/"],
    },
    sitemap: "https://app.onyxlab.dev/sitemap.xml",
  };
}
