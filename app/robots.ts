import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const origin = canonicalOrigin();
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/dashboard", "/repositories", "/runs", "/settings", "/usage"] },
    sitemap: `${origin}/sitemap.xml`,
  };
}

function canonicalOrigin() {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000";
}
