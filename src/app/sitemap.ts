import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  return [
    {
      url: new URL("/", siteUrl).toString(),
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: new URL("/privacy", siteUrl).toString(),
      changeFrequency: "yearly",
      priority: 0.4,
    },
  ];
}
