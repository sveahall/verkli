import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://verkli.com";
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/author/", "/admin/", "/api/", "/auth/", "/dev/"],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
