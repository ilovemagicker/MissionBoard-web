import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://app.onyxlab.dev/",
      lastModified: new Date("2026-10-23"),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: "https://app.onyxlab.dev/login",
      lastModified: new Date("2026-10-23"),
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];
}
