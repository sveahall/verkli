import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeLanguage } from "@/lib/languages";
import { isStripeConfigured } from "@/lib/payments/stripe";
import { getAudiobookStorageBucket } from "@/lib/tts/storage";

function normalizeDefaultPublishVisibility(
  value: unknown
): "public" | "followers" | "private" {
  if (value === "public" || value === "followers" || value === "private") {
    return value;
  }
  return "public";
}

function isMissingPublishedChapterCountColumn(
  error: { code?: string | null; message?: string | null } | null | undefined
): boolean {
  if (!error) return false;
  return (
    error.code === "42703" &&
    typeof error.message === "string" &&
    error.message.includes("published_chapter_count")
  );
}

/**
 * Loads all data needed by BookEditor. Shared across workspace pages.
 * Returns null if the book doesn't exist or doesn't belong to the user.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadBookWorkspaceData(bookId: string, langParam: string | null = null) {
  if (!bookId || !UUID_RE.test(bookId)) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("*")
    .eq("id", bookId)
    .maybeSingle();

  if (bookError) {
    console.error("Failed to load book", bookError);
  }

  if (!book || book.author_id !== user.id) return null;

  const versionSelectBase =
    "id, book_id, language_code, status, published_at, visibility, created_at, updated_at, error_message";

  const withPublishedChapterCount = await supabase
    .from("book_versions")
    .select(`${versionSelectBase}, published_chapter_count`)
    .eq("book_id", book.id)
    .order("created_at", { ascending: true });

  const fallback = isMissingPublishedChapterCountColumn(withPublishedChapterCount.error)
    ? await supabase
        .from("book_versions")
        .select(versionSelectBase)
        .eq("book_id", book.id)
        .order("created_at", { ascending: true })
    : null;

  const bookVersions =
    fallback?.data != null
      ? fallback.data.map((v) => ({ ...v, published_chapter_count: null }))
      : withPublishedChapterCount.data;
  const bookVersionsError = fallback?.error ?? withPublishedChapterCount.error;

  let versions = bookVersions ?? [];
  if (bookVersionsError) {
    console.error("Failed to load book versions", bookVersionsError);
  }

  if (!bookVersionsError && versions.length === 0) {
    const fallbackLanguage = normalizeLanguage(
      (book as { original_language?: string | null; language?: string | null }).original_language ??
        book.language
    );
    const { data: createdVersion, error: createVersionError } = await supabase
      .from("book_versions")
      .insert({ book_id: book.id, language_code: fallbackLanguage, status: "draft" })
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
              ? (createdVersion as { published_chapter_count?: number | null })
                  .published_chapter_count ?? null
              : null,
        },
      ];
      await supabase
        .from("chapters")
        .update({ book_version_id: createdVersion.id })
        .eq("book_id", book.id)
        .is("book_version_id", null);
    }
  }

  const originalLang = normalizeLanguage(
    (book as { original_language?: string | null }).original_language
  );
  const activeVersion =
    (langParam
      ? versions.find((v) => normalizeLanguage(v.language_code) === langParam)
      : null) ??
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
    typeof latestAudiobookAsset?.audio_path === "string" &&
    latestAudiobookAsset.audio_path.trim().length > 0
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
    .select(
      "id, book_id, language, channel, status, headline, caption, cta, hashtags, share_url, created_at, updated_at"
    )
    .eq("book_id", book.id);

  const { data: authorProfile } = await supabase
    .from("profiles")
    .select("display_name, username, preferences")
    .eq("user_id", book.author_id)
    .maybeSingle();

  const authorDisplayName =
    authorProfile?.display_name?.trim() ||
    authorProfile?.username?.trim() ||
    "Author";
  const defaultPublishVisibility = normalizeDefaultPublishVisibility(
    (authorProfile?.preferences as { visibility?: { books?: unknown } } | null)?.visibility?.books
  );

  return {
    book,
    chapters: chapters ?? [],
    versions,
    activeVersion: activeVersion ?? null,
    authorDisplayName,
    defaultPublishVisibility,
    latestAudiobookAsset: latestAudiobookAsset
      ? {
          id: latestAudiobookAsset.id,
          audioSignedUrl: latestAudiobookSignedUrl,
          status: latestAudiobookAsset.status,
          created_at: latestAudiobookAsset.created_at,
        }
      : null,
    marketingCampaigns: marketingCampaigns ?? [],
    stripeConfigured: isStripeConfigured(),
  };
}
