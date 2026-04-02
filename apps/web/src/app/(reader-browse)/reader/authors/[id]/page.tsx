import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAvatarUrlFromPathServer } from "@/lib/supabase/avatar";
import BookCard from "@/components/reader/BookCard";
import PageHeader from "@/components/reader/PageHeader";
import FollowAuthorButton from "./FollowAuthorButton";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id: userId } = await params;
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, username, bio, avatar_url, is_public")
    .eq("user_id", userId)
    .maybeSingle();

  if (!profile) {
    return { title: "Author not found" };
  }

  if (!profile.is_public) {
    const { count } = await supabase
      .from("books")
      .select("id", { count: "exact", head: true })
      .eq("author_id", userId)
      .eq("status", "PUBLISHED");
    if (!count || count === 0) {
      return { title: "Author not found" };
    }
  }

  const displayName = profile.display_name || profile.username || "Author";
  const description = profile.bio
    ? `${profile.bio.slice(0, 150)}${profile.bio.length > 150 ? "..." : ""}`
    : `Read books by ${displayName} on Verkli.`;
  const avatarUrl = await getAvatarUrlFromPathServer(profile.avatar_url);
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

export default async function ReaderAuthorProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: userId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id, display_name, username, bio, avatar_url, is_public")
    .eq("user_id", userId)
    .maybeSingle();

  if (!profile) {
    notFound();
  }

  // Authors with published books are always visible (home page already shows them).
  // Only enforce is_public for users without published books.
  if (!profile.is_public) {
    const { count } = await supabase
      .from("books")
      .select("id", { count: "exact", head: true })
      .eq("author_id", userId)
      .eq("status", "PUBLISHED");
    if (!count || count === 0) {
      notFound();
    }
  }

  const avatarUrl = await getAvatarUrlFromPathServer(profile.avatar_url);
  const displayName = profile.display_name || profile.username || "author";
  const signInHref = `/reader/signin?next=${encodeURIComponent(`/reader/authors/${userId}`)}`;
  const isOwnProfile = user?.id === userId;

  let initialFollowing = false;
  if (user && !isOwnProfile) {
    const { data: followRow } = await supabase
      .from("follows")
      .select("followee_id")
      .eq("follower_id", user.id)
      .eq("followee_id", userId)
      .maybeSingle();
    initialFollowing = Boolean(followRow);
  }

  const { data: books } = await supabase
    .from("books")
    .select("id, title, cover_image, description")
    .eq("author_id", userId)
    .eq("status", "PUBLISHED")
    .order("updated_at", { ascending: false });

  return (
    <div className="section-gap-lg">
      <PageHeader
        eyebrow="Author"
        title={displayName}
        subtitle={profile.bio ?? "Published books and public updates."}
        actions={
          <Link href="/reader/authors" className="btn-secondary">
            Back to authors
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200/70 bg-white/80 px-5 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-white/5">
        <div className="relative h-16 w-16 overflow-hidden rounded-full border border-black/10 bg-slate-100 dark:border-white/10 dark:bg-white/10">
          {avatarUrl ? (
            <Image src={avatarUrl} alt={displayName} fill sizes="64px" className="object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[18px] font-semibold text-slate-600 dark:text-white/70">
              {displayName.split(" ").map((w: string) => w[0]).slice(0, 2).join("")}
            </div>
          )}
        </div>
        <div>
          <p className="text-[15px] font-semibold text-slate-900 dark:text-white">{displayName}</p>
          {profile.username && (
            <p className="text-[13px] text-slate-500 dark:text-white/60">@{profile.username}</p>
          )}
        </div>
        {!isOwnProfile && (
          <div className="ml-auto">
            <FollowAuthorButton
              authorId={userId}
              isSignedIn={Boolean(user)}
              signInHref={signInHref}
              initialFollowing={initialFollowing}
            />
          </div>
        )}
      </div>

      <section className="section-gap">
        <h2 className="text-[18px] font-semibold text-slate-900 dark:text-white">Published books</h2>
        {books && books.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-6">
            {books.map((book) => (
              <BookCard
                key={book.id}
                id={book.id}
                title={book.title}
                author={displayName}
                cover={book.cover_image}
              />
            ))}
          </div>
        ) : (
          <p className="mt-3 text-[14px] text-slate-500 dark:text-white/50">
            No published books yet.
          </p>
        )}
      </section>
    </div>
  );
}
