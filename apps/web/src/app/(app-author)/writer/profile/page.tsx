import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getShelves } from "@/lib/supabase/shelves";
import ProfilePage from "@/components/writer/profile/ProfilePage";
import type { Profile } from "@/lib/supabase/types";

const fallbackBio = "Short bio coming soon.";

export default async function WriterProfileRoute() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/writer/signin");
  }

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const profile = profileRow as Profile | null;

  // Fallbacks ensure the profile renders even if the profile row doesn't exist yet.
  const displayName =
    profile?.display_name ||
    user.user_metadata?.full_name ||
    user.email?.split("@")[0] ||
    "Writer";
  const username =
    profile?.username ||
    user.user_metadata?.username ||
    user.email?.split("@")[0] ||
    "writer";
  const bio = profile?.bio || fallbackBio;
  const avatarUrl = profile?.avatar_url || user.user_metadata?.avatar_url || null;
  const isPublic = profile?.is_public ?? true;

  let shelves: Awaited<ReturnType<typeof getShelves>> = [];
  let booksCountResult: { count: number | null } = { count: 0 };
  let shelvesCountResult: { count: number | null } = { count: 0 };

  try {
    const results = await Promise.allSettled([
      getShelves(),
      supabase.from("books").select("id", { count: "exact", head: true }).eq("author_id", user.id),
      supabase.from("shelves").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    ]);

    if (results[0].status === "fulfilled") {
      shelves = results[0].value;
    } else {
      console.error("Error fetching shelves:", results[0].reason);
    }

    if (results[1].status === "fulfilled") {
      booksCountResult = results[1].value;
    } else {
      console.error("Error fetching books count:", results[1].reason);
    }

    if (results[2].status === "fulfilled") {
      shelvesCountResult = results[2].value;
    } else {
      console.error("Error fetching shelves count:", results[2].reason);
    }
  } catch (error) {
    console.error("Error fetching profile data:", error);
    // Continue with empty data rather than crashing
  }

  const { data: books, error: booksError } = await supabase
    .from("books")
    .select("id, title, slug, cover_image, status, created_at")
    .eq("author_id", user.id)
    .eq("status", "PUBLISHED")
    .order("created_at", { ascending: false });

  if (booksError) {
    console.error("Error fetching books:", booksError);
  }

  const shelfBookIds = new Set(
    shelves.flatMap((shelf) => {
      if (!shelf.shelf_books || !Array.isArray(shelf.shelf_books)) {
        return [];
      }
      return shelf.shelf_books.map((shelfBook) => shelfBook.book_id).filter((id): id is string => !!id);
    })
  );

  const standaloneBooks = (books ?? []).filter((book) => !shelfBookIds.has(book.id));

  let readsCount: number | null = null;
  if (books && books.length > 0) {
    const bookIds = books.map((book) => book.id);
    const { count, error } = await supabase
      .from("readings" as never)
      .select("id", { count: "exact", head: true })
      .in("book_id", bookIds);

    if (!error) readsCount = count ?? null;
  }

  return (
  <div className="min-h-screen bg-gradient-to-b from-background via-background/95 to-background/90 text-foreground">
      <ProfilePage
        profile={{
          displayName,
          username,
          bio,
          avatarUrl,
          isPublic,
        }}
        stats={{
          books: booksCountResult.count ?? 0,
          shelves: shelvesCountResult.count ?? 0,
          reads: readsCount,
        }}
        shelves={(shelves || []).map((shelf) => ({
          id: shelf.id,
          name: shelf.name,
          subtitle: shelf.subtitle,
          cover_url: shelf.cover_url,
          cover_type: shelf.cover_type,
          cover_gradient: shelf.cover_gradient,
        }))}
        standaloneBooks={(standaloneBooks || []).map((book) => ({
          id: book.id,
          title: book.title,
          slug: book.slug,
          cover_image: (book as { cover_image?: string | null }).cover_image ?? null,
          status: book.status,
        }))}
      />
    </div>
  );
}
