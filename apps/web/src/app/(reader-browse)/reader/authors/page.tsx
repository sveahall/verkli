import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAvatarUrlFromPathServer } from "@/lib/supabase/avatar";
import AuthorCard from "@/components/reader/AuthorCard";
import EmptyState from "@/components/reader/EmptyState";
import PageHeader from "@/components/reader/PageHeader";

export default async function ReaderAuthorsPage() {
  const supabase = await createClient();

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("user_id, display_name, username, avatar_url, bio")
    .eq("role", "author")
    .eq("is_public", true)
    .order("updated_at", { ascending: false })
    .limit(36);

  if (error) {
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

  if (!profiles || profiles.length === 0) {
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
            <Link href="/reader/discover" className="btn-primary">
              Discover books
            </Link>
          }
        />
      </div>
    );
  }

  const authorsWithAvatars = await Promise.all(
    profiles.map(async (profile) => ({
      id: profile.user_id,
      name: profile.display_name || profile.username || "author",
      avatar: await getAvatarUrlFromPathServer(profile.avatar_url),
    }))
  );

  return (
    <div className="section-gap-lg">
      <PageHeader
        eyebrow="Discover"
        title="Authors"
        subtitle="Browse public author profiles and open their books."
        actions={
          <Link href="/reader/discover" className="btn-secondary">
            Discover books
          </Link>
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
