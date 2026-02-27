import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/seo/siteUrl";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();
  const siteOrigin = siteUrl?.origin;

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/chat/", "/monitoring"],
      },
    ],
    sitemap: siteOrigin ? `${siteOrigin}/sitemap.xml` : undefined,
    host: siteOrigin,
  };
}
