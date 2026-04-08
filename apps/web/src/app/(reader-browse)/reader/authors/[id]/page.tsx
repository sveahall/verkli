import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ArrowRight, BookOpen, Users } from "lucide-react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAvatarUrlFromPathServer } from "@/lib/supabase/avatar";
import BookCard from "@/components/reader/BookCard";
import FollowAuthorButton from "./FollowAuthorButton";
import SubscribeAuthorButton from "./SubscribeAuthorButton";
import type { Metadata } from "next";

/* ── Metadata ── */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id: userId } = await params;
  const supabase = await createClient();
  const [profileRes, booksCountRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, username, bio, avatar_url, is_public")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("books")
      .select("id", { count: "exact", head: true })
      .eq("author_id", userId)
      .eq("status", "PUBLISHED"),
  ]);

  const profile = profileRes.data;
  const publishedCount = booksCountRes.count ?? 0;

  if (!profile?.is_public && publishedCount === 0) {
    return { title: "Author not found" };
  }

  const displayName = profile?.display_name || profile?.username || "Author";
  const bio = profile?.bio ?? null;
  const description = bio
    ? `${bio.slice(0, 150)}${bio.length > 150 ? "..." : ""}`
    : `Read books by ${displayName} on Verkli.`;
  const avatarUrl = await getAvatarUrlFromPathServer(profile?.avatar_url ?? null);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://verkli.com";

  return {
    title: displayName,
    description,
    openGraph: {
      title: `${displayName} | Verkli`,
      description,
      url: `${siteUrl}/reader/authors/${userId}`,
      siteName: "Verkli",
      type: "profile",
      ...(avatarUrl ? { images: [{ url: avatarUrl, alt: displayName }] } : {}),
    },
    twitter: {
      card: "summary",
      title: `${displayName} | Verkli`,
      description,
      ...(avatarUrl ? { images: [avatarUrl] } : {}),
    },
    alternates: {
      canonical: `${siteUrl}/reader/authors/${userId}`,
    },
  };
}

/* ── Page ── */

export default async function ReaderAuthorProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: userId } = await params;
  const supabase = await createClient();

  const [
    { data: { user } },
    profileRes,
    booksRes,
    followerCountRes,
    subscriptionPlanRes,
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("profiles")
      .select("user_id, display_name, username, bio, avatar_url, is_public")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("books")
      .select("id, title, cover_image, description")
      .eq("author_id", userId)
      .eq("status", "PUBLISHED")
      .order("updated_at", { ascending: false }),
    supabase
      .from("follows")
      .select("followee_id", { count: "exact", head: true })
      .eq("followee_id", userId),
    supabase
      .from("author_subscription_plans" as never)
      .select("enabled, price_monthly, currency, description")
      .eq("author_id", userId)
      .maybeSingle(),
  ]);

  const profile = profileRes.data;
  const books = booksRes.data ?? [];
  const followerCount = followerCountRes.count ?? 0;
  const subscriptionPlan = subscriptionPlanRes.data as {
    enabled: boolean;
    price_monthly: number;
    currency: string;
    description: string | null;
  } | null;

  const hasPublishedBooks = books.length > 0;
  const isPublicProfile = profile?.is_public ?? false;
  if (!hasPublishedBooks && !isPublicProfile) notFound();

  // Fetch genres for all books in one round-trip
  const bookIds = books.map((b) => b.id);
  const genreMap = new Map<string, string[]>();
  if (bookIds.length > 0) {
    const { data: genreJunction } = await supabase
      .from("book_genres")
      .select("book_id, genres(name_en, icon)")
      .in("book_id", bookIds);
    for (const row of genreJunction ?? []) {
      const g = Array.isArray(row.genres) ? row.genres[0] : row.genres;
      if (g && typeof g === "object" && "name_en" in g && g.name_en) {
        const icon = "icon" in g && g.icon ? `${g.icon} ` : "";
        const existing = genreMap.get(row.book_id) ?? [];
        existing.push(`${icon}${g.name_en}`);
        genreMap.set(row.book_id, existing);
      }
    }
  }

  // Chapter count for the featured (first) book
  let featuredChapterCount = 0;
  const featuredBook = books[0] ?? null;
  if (featuredBook) {
    const { data: version } = await supabase
      .from("book_versions")
      .select("id")
      .eq("book_id", featuredBook.id)
      .not("published_at", "is", null)
      .limit(1)
      .maybeSingle();
    if (version) {
      const { count } = await supabase
        .from("chapters")
        .select("id", { count: "exact", head: true })
        .eq("book_version_id", version.id);
      featuredChapterCount = count ?? 0;
    }
  }

  const avatarUrl = await getAvatarUrlFromPathServer(profile?.avatar_url ?? null);
  const displayName = profile?.display_name || profile?.username || "Author";
  const bio = profile?.bio ?? null;
  const username = profile?.username ?? null;
  const signInHref = `/reader/signin?next=${encodeURIComponent(`/reader/authors/${userId}`)}`;
  const isOwnProfile = user?.id === userId;

  let initialFollowing = false;
  let initialSubscribed = false;
  if (user && !isOwnProfile) {
    const [followRow, subRow] = await Promise.all([
      supabase
        .from("follows")
        .select("followee_id")
        .eq("follower_id", user.id)
        .eq("followee_id", userId)
        .maybeSingle(),
      subscriptionPlan?.enabled
        ? supabase
            .from("author_subscriptions" as never)
            .select("id")
            .eq("subscriber_user_id", user.id)
            .eq("author_id", userId)
            .eq("status" as never, "active")
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    initialFollowing = Boolean(followRow.data);
    initialSubscribed = Boolean(subRow.data);
  }

  // Hero backdrop: first book cover, or null
  const heroBackdrop = books.find((b) => b.cover_image)?.cover_image ?? null;
  const initials = displayName
    .split(" ")
    .map((w: string) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="space-y-6 pb-8">

      {/* ── Back link ── */}
      <Link
        href="/reader/authors"
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#64748B] transition-colors hover:text-[#0F172A] dark:text-white/50 dark:hover:text-white"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All authors
      </Link>

      {/* ══════════════════════════════════════════════════
          HERO BANNER
         ══════════════════════════════════════════════════ */}
      <div className="relative min-h-[280px] overflow-hidden rounded-3xl sm:min-h-[320px]">
        {/* Atmospheric backdrop */}
        {heroBackdrop ? (
          <Image
            src={heroBackdrop}
            alt=""
            fill
            aria-hidden
            className="object-cover"
            style={{ filter: "blur(40px) saturate(1.4)", transform: "scale(1.1)" }}
            priority
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#907AFF]/60 via-[#6B5CE7]/40 to-[#E29ED5]/30" />
        )}
        {/* Dark gradient overlay — stronger at bottom for text legibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/10" />

        {/* Content */}
        <div className="relative flex h-full min-h-[280px] flex-col justify-end p-6 sm:min-h-[320px] sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-6">
            {/* Avatar */}
            <div className="relative h-[72px] w-[72px] flex-shrink-0 overflow-hidden rounded-2xl ring-2 ring-white/20 shadow-xl sm:h-[84px] sm:w-[84px]">
              {avatarUrl ? (
                <Image
                  src={avatarUrl}
                  alt={displayName}
                  fill
                  sizes="84px"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#907AFF] to-[#6B5CE7] text-xl font-bold text-white">
                  {initials}
                </div>
              )}
            </div>

            {/* Name + meta */}
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-white/50">
                Author
              </p>
              <h1 className="mt-0.5 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                {displayName}
              </h1>
              {username && (
                <p className="mt-0.5 text-[13px] text-white/55">@{username}</p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-3 text-[13px] text-white/60">
                <span className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  {followerCount.toLocaleString()} follower{followerCount !== 1 ? "s" : ""}
                </span>
                <span className="h-1 w-1 rounded-full bg-white/30" />
                <span className="flex items-center gap-1.5">
                  <BookOpen className="h-3.5 w-3.5" />
                  {books.length} book{books.length !== 1 ? "s" : ""}
                </span>
              </div>
            </div>

            {/* Follow + Subscribe buttons */}
            {!isOwnProfile && (
              <div className="flex flex-shrink-0 items-center gap-2">
                <FollowAuthorButton
                  authorId={userId}
                  isSignedIn={Boolean(user)}
                  signInHref={signInHref}
                  initialFollowing={initialFollowing}
                />
                {subscriptionPlan?.enabled && (
                  <SubscribeAuthorButton
                    authorId={userId}
                    priceMonthlyMinor={subscriptionPlan.price_monthly}
                    currency={subscriptionPlan.currency}
                    isSignedIn={Boolean(user)}
                    signInHref={signInHref}
                    initialSubscribed={initialSubscribed}
                  />
                )}
              </div>
            )}
          </div>

          {/* Bio snippet */}
          {bio && (
            <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-white/65 line-clamp-2">
              {bio}
            </p>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════
          FEATURED BOOK — most recent release
         ══════════════════════════════════════════════════ */}
      {featuredBook && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-widest text-[#64748B] dark:text-white/40">
              Latest release
            </h2>
          </div>

          <Link
            href={`/reader/books/${featuredBook.id}`}
            className="group card-base flex gap-5 overflow-hidden p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_40px_-12px_rgba(144,122,255,0.15)] sm:gap-6 sm:p-6"
          >
            {/* Cover */}
            <div className="relative aspect-[3/4] w-[100px] flex-shrink-0 overflow-hidden rounded-2xl border border-black/[0.06] shadow-md transition-transform duration-500 group-hover:scale-[1.03] dark:border-white/10 sm:w-[120px]">
              {featuredBook.cover_image ? (
                <Image
                  src={featuredBook.cover_image}
                  alt={featuredBook.title}
                  fill
                  sizes="120px"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#907AFF]/20 to-[#E29ED5]/20">
                  <BookOpen className="h-6 w-6 text-[#907AFF]/40" />
                </div>
              )}
            </div>

            {/* Info */}
            <div className="min-w-0 flex-1 space-y-2.5">
              <div>
                <h3 className="text-xl font-bold tracking-tight text-[#0F172A] transition-colors group-hover:text-[#907AFF] dark:text-white dark:group-hover:text-[#B8A8FF] sm:text-2xl">
                  {featuredBook.title}
                </h3>
                <p className="mt-0.5 text-[13px] font-medium text-[#64748B] dark:text-white/50">
                  {displayName}
                </p>
              </div>

              {/* Genre chips */}
              {(genreMap.get(featuredBook.id) ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {(genreMap.get(featuredBook.id) ?? []).map((g) => (
                    <span
                      key={g}
                      className="rounded-full border border-[#907AFF]/20 bg-[#907AFF]/[0.07] px-2.5 py-0.5 text-[11px] font-medium text-[#907AFF] dark:text-[#B8A8FF]"
                    >
                      {g}
                    </span>
                  ))}
                </div>
              )}

              {/* Description */}
              {featuredBook.description && (
                <p className="line-clamp-2 text-[13px] leading-relaxed text-[#64748B] dark:text-white/50 sm:line-clamp-3">
                  {featuredBook.description}
                </p>
              )}

              {/* Meta + CTA */}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                {featuredChapterCount > 0 && (
                  <span className="text-[12px] text-[#64748B] dark:text-white/40">
                    {featuredChapterCount} chapter{featuredChapterCount !== 1 ? "s" : ""}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#907AFF] dark:text-[#B8A8FF]">
                  Start reading
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </div>
          </Link>
        </section>
      )}

      {/* ══════════════════════════════════════════════════
          ALL BOOKS — horizontal scroll rail (if >1)
         ══════════════════════════════════════════════════ */}
      {books.length > 1 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-widest text-[#64748B] dark:text-white/40">
              All books
            </h2>
            <span className="text-[12px] text-[#64748B] dark:text-white/40">
              {books.length} total
            </span>
          </div>

          <div className="-mx-4 sm:mx-0">
            <div className="scrollbar-none flex gap-3 overflow-x-auto px-4 pb-1 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 md:grid-cols-4 lg:grid-cols-5">
              {books.map((book) => {
                const genres = genreMap.get(book.id) ?? [];
                return (
                  <div key={book.id} className="w-[148px] flex-shrink-0 sm:w-auto">
                    <BookCard
                      id={book.id}
                      title={book.title}
                      author={displayName}
                      genre={genres[0]}
                      cover={book.cover_image}
                      layout="grid"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════
          ABOUT — full bio
         ══════════════════════════════════════════════════ */}
      {bio && bio.length > 80 && (
        <section className="card-base space-y-3 p-6">
          <h2 className="text-[11px] font-semibold uppercase tracking-widest text-[#64748B] dark:text-white/40">
            About
          </h2>
          <p className="text-[14px] leading-relaxed text-[#334155] dark:text-white/70">
            {bio}
          </p>
        </section>
      )}

      {/* Empty state */}
      {books.length === 0 && (
        <div className="card-base p-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#907AFF]/10">
            <BookOpen className="h-5 w-5 text-[#907AFF]" />
          </div>
          <p className="mt-4 text-[15px] font-semibold text-[#0F172A] dark:text-white">
            No published books yet
          </p>
          <p className="mt-1 text-[13px] text-[#64748B] dark:text-white/50">
            Check back later for new releases.
          </p>
        </div>
      )}
    </div>
  );
}
