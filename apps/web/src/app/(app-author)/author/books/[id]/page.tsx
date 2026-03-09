import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeLanguage } from "@/lib/languages";
import { isStripeConfigured } from "@/lib/payments/stripe";
import { getAudiobookStorageBucket } from "@/lib/tts/storage";
import BookEditor from "./BookEditor";

function isMissingPublishedChapterCountColumn(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false;
  return (
    error.code === "42703" &&
    typeof error.message === "string" &&
    error.message.includes("published_chapter_count")
  );
}

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
  const langParam = resolvedSearchParams?.lang ? normalizeLanguage(resolvedSearchParams.lang) : null;
  
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

  const versionSelectBase =
    "id, book_id, language_code, status, published_at, visibility, created_at, updated_at, error_message";

  const withPublishedChapterCount = await supabase
    .from("book_versions")
    .select(`${versionSelectBase}, published_chapter_count`)
    .eq("book_id", book.id)
    .order("created_at", { ascending: true });

  const fallbackWithoutPublishedChapterCount = isMissingPublishedChapterCountColumn(
    withPublishedChapterCount.error
  )
    ? await supabase
        .from("book_versions")
        .select(versionSelectBase)
        .eq("book_id", book.id)
        .order("created_at", { ascending: true })
    : null;

  const bookVersions =
    fallbackWithoutPublishedChapterCount?.data != null
      ? fallbackWithoutPublishedChapterCount.data.map((version) => ({
          ...version,
          published_chapter_count: null,
        }))
      : withPublishedChapterCount.data;
  const bookVersionsError = fallbackWithoutPublishedChapterCount?.error ?? withPublishedChapterCount.error;

  let versions = bookVersions ?? [];
  if (bookVersionsError) {
    console.error("Failed to load book versions", bookVersionsError);
  }

  if (!bookVersionsError && versions.length === 0) {
    const fallbackLanguage = normalizeLanguage(
      (book as { original_language?: string | null; language?: string | null }).original_language ?? book.language
    );
    const { data: createdVersion, error: createVersionError } = await supabase
      .from("book_versions")
      .insert({
        book_id: book.id,
        language_code: fallbackLanguage,
        status: "draft",
      })
      .select("*")
      .single();
    if (createVersionError) {
      console.error("Failed to auto-create book version", createVersionError);
    } else if (createdVersion) {
      versions = [
        {
          ...createdVersion,
          published_chapter_count:
            "published_chapter_count" in createdVersion
              ? (createdVersion as { published_chapter_count?: number | null }).published_chapter_count ?? null
              : null,
        },
      ];
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
  const originalLang = normalizeLanguage((book as { original_language?: string | null }).original_language);
  const activeVersion =
    (langParam ? versions.find((v) => normalizeLanguage(v.language_code) === langParam) : null) ??
    versions.find((v) => normalizeLanguage(v.language_code) === originalLang) ??
    versions[0];

  const { data: latestAudiobookAsset } = await supabase
    .from("audiobook_assets")
    .select("id, audio_path, status, created_at")
    .eq("book_id", book.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const latestAudioPath =
    typeof latestAudiobookAsset?.audio_path === "string" && latestAudiobookAsset.audio_path.trim().length > 0
      ? latestAudiobookAsset.audio_path.trim()
      : null;
  let latestAudiobookSignedUrl: string | null = null;
  if (latestAudioPath) {
    const bucket = getAudiobookStorageBucket();
    const admin = createAdminClient();
    const { data: signed } = await admin.storage
      .from(bucket)
      .createSignedUrl(latestAudioPath, 60 * 15);
    latestAudiobookSignedUrl = signed?.signedUrl ?? null;
  }

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id, title, content, order, book_version_id")
    .eq("book_version_id", activeVersion?.id ?? "")
    .order("order", { ascending: true });

  const { data: marketingCampaigns } = await supabase
    .from("marketing_campaigns")
    .select("id, book_id, language, channel, status, headline, caption, cta, hashtags, share_url, created_at, updated_at")
    .eq("book_id", book.id);

  const { data: authorProfile } = await supabase
    .from("profiles")
    .select("display_name, username")
    .eq("user_id", book.author_id)
    .maybeSingle();

  const authorDisplayName =
    authorProfile?.display_name?.trim() ||
    authorProfile?.username?.trim() ||
    "Author";

  const stripeConfigured = isStripeConfigured();

  return (
    <main className="min-h-screen bg-gray-100 text-foreground dark:bg-slate-900/50">
      <header className="mx-auto max-w-[1400px] px-6 pt-6">
        <Link
          href="/author/books"
          className="group inline-flex items-center gap-2 rounded-full border border-black/[0.06] bg-white/60 px-4 py-2 text-[13px] font-medium text-slate-500 backdrop-blur-sm transition-all hover:border-black/[0.1] hover:bg-white hover:text-slate-900 dark:border-white/[0.06] dark:bg-white/[0.03] dark:text-white/50 dark:hover:border-white/[0.1] dark:hover:text-white"
        >
          <svg className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to books
        </Link>
      </header>

      <BookEditor
        book={book}
        chapters={chapters ?? []}
        bookVersions={versions}
        activeVersion={activeVersion ?? null}
        authorDisplayName={authorDisplayName}
        latestAudiobookAsset={
          latestAudiobookAsset
            ? {
                id: latestAudiobookAsset.id,
                audioSignedUrl: latestAudiobookSignedUrl,
                status: latestAudiobookAsset.status,
                created_at: latestAudiobookAsset.created_at,
              }
            : null
        }
        marketingCampaigns={marketingCampaigns ?? []}
        stripeConfigured={stripeConfigured}
      />
    </main>
  );
}
