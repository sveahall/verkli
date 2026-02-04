import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { normalizeLanguageOrNull } from "@/lib/languages";
import BookEditor from "./BookEditor";

export default async function BookDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ lang?: string }>;
}) {
  // Next.js 16+: params is a Promise, must await
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const langParam = resolvedSearchParams?.lang ? String(resolvedSearchParams.lang).trim().toLowerCase() : null;
  
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/author/signin");
  }

  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (bookError) {
    console.error("Failed to load book", bookError);
  }

  if (!book || book.author_id !== user.id) {
    notFound();
  }

  const { data: bookVersions, error: bookVersionsError } = await supabase
    .from("book_versions")
    .select("id, book_id, language_code, status, published_at, created_at, updated_at")
    .eq("book_id", book.id)
    .order("created_at", { ascending: true });

  let versions = bookVersions ?? [];
  if (bookVersionsError) {
    console.error("Failed to load book versions", bookVersionsError);
  }

  if (!bookVersionsError && versions.length === 0) {
    const fallbackLanguage =
      normalizeLanguageOrNull(
        (book as { original_language?: string | null; language?: string | null }).original_language ?? book.language
      ) ?? "und";
    const { data: createdVersion, error: createVersionError } = await supabase
      .from("book_versions")
      .insert({
        book_id: book.id,
        language_code: fallbackLanguage,
        status: "draft",
      })
      .select("id, book_id, language_code, status, published_at, created_at, updated_at")
      .single();
    if (createVersionError) {
      console.error("Failed to auto-create book version", createVersionError);
    } else if (createdVersion) {
      versions = [createdVersion];
      const { error: relinkError } = await supabase
        .from("chapters")
        .update({ book_version_id: createdVersion.id })
        .eq("book_id", book.id)
        .is("book_version_id", null);
      if (relinkError) {
        console.error("Failed to relink chapters to book version", relinkError);
      }
    }
  }
  const originalLang = normalizeLanguageOrNull(
    (book as { original_language?: string | null; language?: string | null }).original_language ?? book.language
  );
  const activeVersion =
    (langParam ? versions.find((v) => String(v.language_code ?? "").trim().toLowerCase() === langParam) : null) ??
    (originalLang ? versions.find((v) => String(v.language_code ?? "").trim().toLowerCase() === originalLang) : null) ??
    versions[0];

  const { data: latestAudiobookAsset } = await supabase
    .from("audiobook_assets")
    .select("id, audio_url, status, created_at")
    .eq("book_id", book.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id, title, content, order, book_version_id")
    .eq("book_version_id", activeVersion?.id ?? "")
    .order("order", { ascending: true });

  const { data: marketingCampaigns } = await supabase
    .from("marketing_campaigns")
    .select("id, book_id, language, channel, status, headline, caption, cta, hashtags, share_url, created_at, updated_at")
    .eq("book_id", book.id);

  return (
    <BookEditor
      book={book}
      chapters={chapters ?? []}
      bookVersions={versions}
      activeVersion={activeVersion ?? null}
      latestAudiobookAsset={latestAudiobookAsset ?? null}
      marketingCampaigns={marketingCampaigns ?? []}
    />
  );
}
