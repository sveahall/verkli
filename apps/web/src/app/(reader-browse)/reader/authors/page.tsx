import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Authors",
  description:
    "Browse public authors on Verkli. Discover new voices and follow your favourites.",
  openGraph: {
    title: "Authors | Verkli",
    description:
      "Browse public authors on Verkli. Discover new voices and follow your favourites.",
  },
};
import { AVATARS_BUCKET_PUBLIC } from "@/lib/supabase/config";
import { getDiscoverHref } from "@/lib/flags";
import {
  getPublicAuthorInfoMap,
  resolvePublicAuthorName,
} from "@/lib/authors/public-author";
import AuthorCard from "@/components/reader/AuthorCard";
import EmptyState from "@/components/reader/EmptyState";
import PageHeader from "@/components/reader/PageHeader";

export default async function ReaderAuthorsPage() {
  const supabase = await createClient();
  const discoverHref = getDiscoverHref();

  const { data: publishedBooks, error: booksError } = await supabase
    .from("books")
    .select("author_id, published_at, updated_at")
    .eq("status", "PUBLISHED")
    .order("published_at", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(500);

  if (booksError) {
    return (
      <div className="section-gap-lg">
        <PageHeader
          eyebrow="Discover"
          title="Authors"
          subtitle="Browse public author profiles and open their books."
        />
        <EmptyState
          title="Couldn&apos;t load authors"
          description="Refresh the page or try again in a moment."
          action={
            <Link href="/reader/authors" className="btn-secondary">
              Retry
            </Link>
          }
        />
      </div>
    );
  }

  const authorIdsInOrder: string[] = [];
  const seenAuthorIds = new Set<string>();
  for (const book of publishedBooks ?? []) {
    if (!book.author_id || seenAuthorIds.has(book.author_id)) continue;
    seenAuthorIds.add(book.author_id);
    authorIdsInOrder.push(book.author_id);
    if (authorIdsInOrder.length >= 36) break;
  }

  // Read author public identity through the admin-client helper so RLS-private
  // profiles (is_public=false) still surface their book-author attribution.
  // See lib/authors/public-author.ts for the rationale.
  const authorInfoMap = await getPublicAuthorInfoMap(authorIdsInOrder);

  if (authorIdsInOrder.length === 0) {
    return (
      <div className="section-gap-lg">
        <PageHeader
          eyebrow="Discover"
          title="Authors"
          subtitle="Browse public author profiles and open their books."
        />
        <EmptyState
          title="No authors yet"
          description="As authors publish, their profiles will appear here."
          action={
            discoverHref ? (
              <Link href={discoverHref} className="btn-primary">
                Discover books
              </Link>
            ) : undefined
          }
        />
      </div>
    );
  }

  const avatarBucket = supabase.storage.from("avatars");
  const authorsWithAvatars = authorIdsInOrder.map((authorId) => {
    const info = authorInfoMap.get(authorId);
    let avatar: string | null = null;
    const avatarPath = info?.avatar_url;
    if (avatarPath && avatarPath.trim()) {
      if (avatarPath.startsWith("http://") || avatarPath.startsWith("https://")) {
        avatar = avatarPath;
      } else if (AVATARS_BUCKET_PUBLIC) {
        avatar = avatarBucket.getPublicUrl(avatarPath).data.publicUrl;
      }
    }
    return {
      id: authorId,
      name: resolvePublicAuthorName(info),
      avatar,
    };
  });

  return (
    <div className="section-gap-lg">
      <PageHeader
        eyebrow="Discover"
        title="Authors"
        subtitle="Browse public author profiles and open their books."
        actions={
          discoverHref ? (
            <Link href={discoverHref} className="btn-secondary">
              Discover books
            </Link>
          ) : undefined
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {authorsWithAvatars.map((author) => (
          <AuthorCard
            key={author.id}
            name={author.name}
            avatar={author.avatar}
            href={`/reader/authors/${author.id}`}
          />
        ))}
      </div>
    </div>
  );
}
