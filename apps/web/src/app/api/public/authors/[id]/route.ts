import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  apiError,
  E_DATABASE_ERROR,
  E_INVALID_USER_ID,
  E_RATE_LIMIT_EXCEEDED,
  isValidUuid,
} from "@/lib/api-errors";
import {
  PUBLIC_BOOK_COLUMNS,
  toPublicBookSummary,
  type AuthorRow,
  type BookRow,
} from "@/lib/api/public-book";
import { getClientIp, publicApiRateLimiter } from "../../_shared";

type ProfileRow = {
  user_id: string;
  display_name: string | null;
  username: string | null;
  bio: string | null;
  avatar_url: string | null;
  is_public: boolean | null;
  website_url: string | null;
  social_links: unknown;
};

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://verkli.com";
}

function extractSocialLinks(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const links: string[] = [];
  for (const v of Object.values(value as Record<string, unknown>)) {
    if (typeof v === "string" && v.startsWith("http")) {
      links.push(v);
    }
  }
  return links;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const limit = await publicApiRateLimiter.check(getClientIp(request));
  if (!limit.allowed) {
    return apiError(E_RATE_LIMIT_EXCEEDED, 429, {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const { id } = await params;
  if (!isValidUuid(id)) {
    return apiError(E_INVALID_USER_ID, 400);
  }

  const supabase = createAdminClient();

  const [profileRes, booksRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("user_id, display_name, username, bio, avatar_url, is_public, website_url, social_links")
      .eq("user_id", id)
      .maybeSingle(),
    supabase
      .from("books")
      .select(PUBLIC_BOOK_COLUMNS)
      .eq("author_id", id)
      .eq("status", "PUBLISHED")
      .order("updated_at", { ascending: false }),
  ]);

  if (profileRes.error || booksRes.error) {
    return apiError(E_DATABASE_ERROR, 500);
  }

  const profile = profileRes.data as ProfileRow | null;
  const books = (booksRes.data ?? []) as unknown as BookRow[];

  const isVisible = (profile?.is_public === true) || books.length > 0;
  if (!profile || !isVisible) {
    return NextResponse.json({ error: "AUTHOR_NOT_FOUND" }, { status: 404 });
  }

  const authorRow: AuthorRow = {
    user_id: profile.user_id,
    display_name: profile.display_name,
    username: profile.username,
  };

  return NextResponse.json({
    id: profile.user_id,
    name: profile.display_name?.trim() || profile.username || "Unknown author",
    username: profile.username,
    bio: profile.bio,
    avatar_url: profile.avatar_url,
    website_url: profile.website_url,
    same_as: extractSocialLinks(profile.social_links),
    canonical_url: `${siteUrl()}/reader/authors/${profile.user_id}`,
    books: books.map((b) => toPublicBookSummary(b, authorRow)),
  });
}
