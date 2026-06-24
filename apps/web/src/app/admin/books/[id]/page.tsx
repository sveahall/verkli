// Admin book moderation detail (books vertical).
//
// Lets admins read a book's chapters and listen to its audio for moderation.
// Inherits admin auth from app/admin/layout.tsx (requireAdminPageAccess).
// Uses the service-role client so chapter content of DRAFT / unpublished books
// (hidden from the anon client by RLS) is readable.

import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidUuid } from "@/lib/api-errors";
import { PageHeader } from "@/components/ui/page-header";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import {
  ChapterModerationList,
  type ModerationChapter,
} from "./ChapterModerationList";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type BookStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

function statusBadgeVariant(status: string): BadgeProps["variant"] {
  switch (status.toUpperCase()) {
    case "PUBLISHED":
      return "success";
    case "DRAFT":
      return "warning";
    default:
      return "neutral";
  }
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

async function loadBook(bookId: string) {
  const admin = createAdminClient();

  const { data: book } = await admin
    .from("books")
    .select(
      "id, title, slug, description, cover_image, status, author_id, language, original_language, created_at, updated_at"
    )
    .eq("id", bookId)
    .maybeSingle();

  if (!book) return null;

  let authorName = "Unknown";
  if (book.author_id) {
    const { data: profile } = await admin
      .from("profiles")
      .select("display_name")
      .eq("user_id", book.author_id)
      .maybeSingle();
    const displayName =
      typeof profile?.display_name === "string" ? profile.display_name.trim() : "";
    if (displayName) authorName = displayName;
  }

  const { data: versionRows } = await admin
    .from("book_versions")
    .select("id, language_code")
    .eq("book_id", bookId);

  const languageByVersionId = new Map<string, string>(
    (versionRows ?? []).map((v) => [v.id as string, (v.language_code as string) ?? ""])
  );

  const { data: chapterRows } = await admin
    .from("chapters")
    .select("id, title, order, book_version_id, content, source_text")
    .eq("book_id", bookId)
    .order("order", { ascending: true });

  const chapters = chapterRows ?? [];
  const chapterIds = chapters.map((c) => c.id as string);

  const chaptersWithAudio = new Set<string>();
  if (chapterIds.length > 0) {
    const { data: audioRows } = await admin
      .from("chapter_audio_cache")
      .select("chapter_id, audio_path")
      .in("chapter_id", chapterIds);

    for (const row of audioRows ?? []) {
      const path = typeof row.audio_path === "string" ? row.audio_path.trim() : "";
      if (path) chaptersWithAudio.add(row.chapter_id as string);
    }
  }

  const moderationChapters: ModerationChapter[] = chapters.map((c) => {
    const versionId = c.book_version_id as string;
    return {
      id: c.id as string,
      title: (c.title as string) ?? "",
      order: typeof c.order === "number" ? c.order : 0,
      languageCode: languageByVersionId.get(versionId) ?? "",
      content: (c.content as string | null) ?? null,
      sourceText: (c.source_text as string | null) ?? null,
      hasAudio: chaptersWithAudio.has(c.id as string),
    };
  });

  const languages = [
    ...new Set(
      (versionRows ?? [])
        .map((v) => ((v.language_code as string) ?? "").trim())
        .filter(Boolean)
    ),
  ];

  return {
    id: book.id as string,
    title: (book.title as string) ?? "Untitled",
    slug: (book.slug as string) ?? "",
    description: (book.description as string | null) ?? null,
    coverImage: (book.cover_image as string | null) ?? null,
    status: ((book.status as string) ?? "DRAFT") as BookStatus,
    authorId: (book.author_id as string | null) ?? null,
    authorName,
    languages,
    createdAt: (book.created_at as string | null) ?? null,
    updatedAt: (book.updated_at as string | null) ?? null,
    chapters: moderationChapters,
  };
}

export default async function AdminBookDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isValidUuid(id)) notFound();

  const book = await loadBook(id);
  if (!book) notFound();

  return (
    <div className="page-content py-10">
      <Breadcrumbs
        className="mb-4"
        items={[
          { label: "Admin", href: "/admin" },
          { label: "Books", href: "/admin/books" },
          { label: book.title },
        ]}
      />
      <PageHeader
        eyebrow="Moderation"
        title={book.title}
        description="Review this book's chapters and listen to its audio."
        actions={
          <Badge variant={statusBadgeVariant(book.status)}>{book.status}</Badge>
        }
      />

      <Card className="mt-8 overflow-hidden">
        <CardContent className="flex flex-col gap-6 sm:flex-row">
          <div className="shrink-0">
            {book.coverImage ? (
              // eslint-disable-next-line @next/next/no-img-element -- Supabase storage host, plain <img> matches existing cover usage.
              <img
                src={book.coverImage}
                alt={`Cover of ${book.title}`}
                className="h-44 w-32 rounded-xl border border-slate-200/80 object-cover dark:border-white/10"
              />
            ) : (
              <div className="flex h-44 w-32 items-center justify-center rounded-xl border border-slate-200/80 bg-gradient-to-br from-[#907AFF]/20 via-[#E29ED5]/20 to-[#FCC997]/20 dark:border-white/10">
                <BookOpen className="h-8 w-8 text-slate-400 dark:text-white/40" aria-hidden />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-4">
            {book.languages.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {book.languages.map((lang) => (
                  <Badge key={lang} variant="neutral" dot={false}>
                    {lang.toUpperCase()}
                  </Badge>
                ))}
              </div>
            )}

            {book.description ? (
              <p className="text-body text-slate-600 dark:text-white/60">
                {book.description}
              </p>
            ) : (
              <p className="text-caption text-slate-400 dark:text-white/40">
                No description.
              </p>
            )}

            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <dt className="text-eyebrow">Author</dt>
                <dd className="mt-1 text-body">
                  {book.authorName ? (
                    <Link
                      href={
                        book.authorId
                          ? `/admin/users/${book.authorId}`
                          : `/admin/users?q=${encodeURIComponent(book.authorName)}`
                      }
                      className="rounded-md font-medium text-[var(--brand-violet)] transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2"
                    >
                      {book.authorName}
                    </Link>
                  ) : (
                    "Unknown"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-eyebrow">Chapters</dt>
                <dd className="mt-1 text-body tabular-nums">{book.chapters.length}</dd>
              </div>
              <div>
                <dt className="text-eyebrow">Created</dt>
                <dd className="mt-1 text-body tabular-nums">{formatDate(book.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-eyebrow">Updated</dt>
                <dd className="mt-1 text-body tabular-nums">{formatDate(book.updatedAt)}</dd>
              </div>
            </dl>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6 overflow-hidden">
        <CardHeader>
          <h2 className="text-section-title">Chapters</h2>
        </CardHeader>
        <CardContent>
          <ChapterModerationList bookId={book.id} chapters={book.chapters} />
        </CardContent>
      </Card>
    </div>
  );
}
