import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000";
  return [{ url: origin, lastModified: new Date(), changeFrequency: "monthly", priority: 1 }];
}
