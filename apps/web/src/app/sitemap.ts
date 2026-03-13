import type { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://verkli.com";
  const supabase = createAdminClient();

  const [booksResult, authorsResult] = await Promise.all([
    supabase
      .from("books")
      .select("id, updated_at")
      .eq("status", "PUBLISHED")
      .order("updated_at", { ascending: false })
      .limit(5000),
    supabase
      .from("profiles")
      .select("user_id, updated_at")
      .eq("role", "author")
      .eq("is_public", true)
      .limit(1000),
  ]);

  const staticPages: MetadataRoute.Sitemap = [
    { url: siteUrl, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/reader/discover`, changeFrequency: "daily", priority: 0.9 },
    { url: `${siteUrl}/reader`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${siteUrl}/reader/authors`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${siteUrl}/reader/genres`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${siteUrl}/reader/faq`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${siteUrl}/reader/how-it-works`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${siteUrl}/reader/membership`, changeFrequency: "monthly", priority: 0.5 },
  ];

  const bookPages: MetadataRoute.Sitemap = (booksResult.data ?? []).map((book) => ({
    url: `${siteUrl}/reader/books/${book.id}`,
    lastModified: book.updated_at ? new Date(book.updated_at) : undefined,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  const authorPages: MetadataRoute.Sitemap = (authorsResult.data ?? []).map((profile) => ({
    url: `${siteUrl}/reader/authors/${profile.user_id}`,
    lastModified: profile.updated_at ? new Date(profile.updated_at) : undefined,
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));

  return [...staticPages, ...bookPages, ...authorPages];
}
