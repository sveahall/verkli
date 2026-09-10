import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  BookText,
  Clock,
  ExternalLink,
  Globe,
  Headphones,
  Languages,
  PenLine,
  Tag,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import DeleteBookButton from "@/components/books/DeleteBookButton";

/* ════════════════════════════════════════════════════════════════════ */

export default async function BookPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/author/signin");

  const { data: book } = await supabase
    .from("books")
    .select(
      "id, title, description, cover_image, status, language, audiobook_status, price_amount, price_currency, pricing_model, author_id",
    )
    .eq("id", id)
    .single();

  if (!book || book.author_id !== user.id) notFound();
  const b = book;

  const [{ data: chapters }, { data: versions }, { data: audioAssets }] =
    await Promise.all([
      supabase
        .from("chapters")
        .select("id, title, order")
        .eq("book_id", id)
        .order("order", { ascending: true }),
      supabase
        .from("book_versions")
        .select("id, language_code, published_at")
        .eq("book_id", id),
      supabase
        .from("audiobook_assets")
        .select("id, language, status, duration_seconds")
        .eq("book_id", id),
    ]);

  const isPublished = b.status === "PUBLISHED";
  const chapterList = chapters ?? [];
  const translationVersions = (versions ?? []).filter(
    (v) => v.language_code !== b.language,
  );
  const audioList = (audioAssets ?? []).filter(
    (a) => a.status === "ready" || a.status === "completed",
  );
  const hasAudiobook = audioList.length > 0;
  const totalAudioSec = audioList.reduce(
    (s, a) => s + (a.duration_seconds ?? 0),
    0,
  );

  function dur(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m} min`;
  }

  function lang(code: string): string {
    try {
      return (
        new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code
      );
    } catch {
      return code;
    }
  }

  function price(): string {
    if (!b.price_amount || b.price_amount <= 0) return "Free";
    const amt = b.price_amount / 100;
    return `${b.price_currency?.toUpperCase() ?? "SEK"} ${amt.toFixed(2)}`;
  }

  const availableLanguages = [
    { code: b.language ?? "en", isOriginal: true, published: isPublished },
    ...translationVersions.map((v) => ({
      code: v.language_code,
      isOriginal: false,
      published: !!v.published_at,
    })),
  ];

  return (
    <div className="mx-auto max-w-[1520px] px-4 pb-16 pt-8 sm:px-6 lg:px-8 xl:px-10">
      {/* ── Breadcrumb ── */}
      <nav className="mb-6 flex items-center justify-between">
        <Link
          href="/author/library"
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-muted hover:text-muted-foreground dark:text-muted-foreground dark:hover:bg-accent dark:hover:text-muted-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Library
        </Link>
        <div className="flex items-center gap-2.5">
          {isPublished && (
            <Link
              href={`/reader/books/${id}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-[13px] font-medium text-muted-foreground transition-[border-color,color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:border-border hover:text-foreground active:scale-[0.97] dark:border-border dark:text-muted-foreground dark:hover:border-border"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View as reader
            </Link>
          )}
          <Link
            href={`/author/books/${id}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground transition-[transform,background-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-primary/90 active:scale-[0.97]"
          >
            <PenLine className="h-3.5 w-3.5" />
            Edit book
          </Link>
          <DeleteBookButton
            bookId={id}
            bookTitle={b.title}
            redirectTo="/author/library"
            label=""
            className="inline-flex items-center justify-center rounded-full border border-border p-2 text-muted-foreground transition-[border-color,color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:border-red-200 hover:text-red-500 active:scale-[0.97] dark:border-border dark:text-muted-foreground dark:hover:border-red-800 dark:hover:text-red-400"
          />
        </div>
      </nav>

      {/* ── Hero card (cover + info + stats footer) ── */}
      <section className="overflow-hidden rounded-2xl border border-border/60 bg-card dark:border-border dark:bg-card">
        <div className="flex flex-col gap-6 p-4 pb-0 sm:flex-row sm:items-start sm:gap-10 sm:p-8 sm:pb-0">
          {/* Cover — the star of the page */}
          <div className="relative mx-auto h-[240px] w-[160px] shrink-0 overflow-hidden rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.12),0_2px_6px_rgba(0,0,0,0.06)] sm:mx-0 sm:h-[296px] sm:w-[200px] dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
            {b.cover_image ? (
              <Image
                src={b.cover_image}
                alt=""
                fill
                sizes="200px"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted dark:from-white/[0.06] dark:to-white/[0.02]">
                <BookOpen className="h-10 w-10 text-muted-foreground dark:text-muted-foreground" />
              </div>
            )}
          </div>

          {/* Info */}
          <div className="min-w-0 flex-1 pb-8">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                  isPublished
                    ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
                    : "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400"
                }`}
              >
                {isPublished ? "Published" : "Draft"}
              </span>
              {hasAudiobook && (
                <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-0.5 text-[11px] font-semibold text-violet-600 dark:bg-violet-500/10 dark:text-violet-400">
                  <Headphones className="h-3 w-3" />
                  Audiobook
                </span>
              )}
            </div>

            <h1 className="author-page-title mt-4 leading-[1.15] text-foreground">
              {b.title}
            </h1>

            {b.description ? (
              <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground dark:text-muted-foreground">
                {b.description}
              </p>
            ) : (
              <p className="mt-3 text-[15px] italic text-muted-foreground dark:text-muted-foreground">
                No description added yet.
              </p>
            )}

          </div>
        </div>

        {/* Stats footer — horizontal strip inside the hero card */}
        <div className="grid grid-cols-2 border-t border-border lg:grid-cols-4 dark:border-border">
          <StatCell
            icon={<Globe className="h-4 w-4 text-blue-500" />}
            label="Language"
            value={lang(b.language ?? "en")}
          />
          <StatCell
            icon={<BookText className="h-4 w-4 text-accent-foreground" />}
            label="Chapters"
            value={String(chapterList.length)}
          />
          <StatCell
            icon={<Tag className="h-4 w-4 text-emerald-500" />}
            label="Price"
            value={price()}
          />
          <StatCell
            icon={<Clock className="h-4 w-4 text-violet-500" />}
            label="Audio"
            value={hasAudiobook ? dur(totalAudioSec) : "—"}
            last
          />
        </div>
      </section>

      {/* ── Content: sidebar + chapters ── */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_2fr]">
        {/* Left column */}
        <div className="space-y-6">
          {/* Availability */}
          <section className="rounded-2xl border border-border/60 bg-card p-6 dark:border-border dark:bg-card">
            <h2 className="author-section-title flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground dark:text-muted-foreground">
              <Globe className="h-3.5 w-3.5" />
              Available in
            </h2>
            <div className="mt-4 space-y-2">
              {availableLanguages.map((l) => (
                <div
                  key={l.code}
                  className="flex items-center justify-between rounded-xl bg-background/80 px-4 py-3 dark:bg-card"
                >
                  <div className="flex items-center gap-2.5">
                    <Languages className="h-4 w-4 text-blue-500" />
                    <span className="text-[14px] font-medium text-foreground dark:text-foreground">
                      {lang(l.code)}
                    </span>
                    {l.isOriginal && (
                      <span className="rounded-md bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground dark:bg-card dark:text-muted-foreground">
                        Original
                      </span>
                    )}
                  </div>
                  {l.published ? (
                    <span className="flex items-center gap-1.5 text-[12px] font-medium text-emerald-600 dark:text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Live
                    </span>
                  ) : (
                    <span className="text-[12px] text-muted-foreground dark:text-muted-foreground">
                      Draft
                    </span>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4 border-t border-border pt-3 dark:border-border">
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-muted-foreground dark:text-muted-foreground">
                  Pricing
                </span>
                <span className="font-semibold text-foreground dark:text-foreground">
                  {price()}
                </span>
              </div>
            </div>
          </section>

          {/* Audiobook */}
          <section className="rounded-2xl border border-border/60 bg-card p-6 dark:border-border dark:bg-card">
            <h2 className="author-section-title flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground dark:text-muted-foreground">
              <Headphones className="h-3.5 w-3.5" />
              Audiobook
            </h2>
            {hasAudiobook ? (
              <div className="mt-4 space-y-2">
                {audioList.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between rounded-xl bg-violet-50/50 px-4 py-3 dark:bg-violet-500/5"
                  >
                    <div className="flex items-center gap-2.5">
                      <Headphones className="h-4 w-4 text-violet-500" />
                      <span className="text-[14px] font-medium text-foreground dark:text-foreground">
                        {lang(a.language ?? "en")}
                      </span>
                    </div>
                    <span className="text-[13px] tabular-nums font-medium text-violet-600 dark:text-violet-400">
                      {a.duration_seconds != null
                        ? dur(a.duration_seconds)
                        : "—"}
                    </span>
                  </div>
                ))}
                <div className="mt-3 border-t border-border pt-3 dark:border-border">
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-muted-foreground dark:text-muted-foreground">
                      Total
                    </span>
                    <span className="font-semibold text-foreground dark:text-foreground">
                      {dur(totalAudioSec)}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex flex-col items-center rounded-xl border border-dashed border-border py-8 dark:border-border">
                <Headphones className="h-6 w-6 text-muted-foreground dark:text-muted-foreground" />
                <p className="mt-2 text-[13px] text-muted-foreground dark:text-muted-foreground">
                  No audiobook yet.
                </p>
                <Link
                  href={`/author/books/${id}?panel=audiobook`}
                  className="mt-3 rounded-full border border-[#8E79FF]/30 px-3.5 py-1 text-[12px] font-medium text-accent-foreground transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-[#8E79FF]/5 active:scale-[0.97] dark:text-accent-foreground"
                >
                  Generate audiobook
                </Link>
              </div>
            )}
          </section>
        </div>

        {/* Right: Chapters */}
        <section className="overflow-hidden rounded-2xl border border-border/60 bg-card dark:border-border dark:bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-7 sm:py-4 dark:border-border">
            <h2 className="author-section-title flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground dark:text-muted-foreground">
              <BookText className="h-3.5 w-3.5" />
              Chapters
            </h2>
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-[12px] tabular-nums font-semibold text-muted-foreground dark:bg-card dark:text-muted-foreground">
              {chapterList.length}
            </span>
          </div>
          {chapterList.length === 0 ? (
            <p className="px-7 py-12 text-center text-[14px] text-muted-foreground dark:text-muted-foreground">
              No chapters yet.
            </p>
          ) : (
            <div className="max-h-[560px] overflow-y-auto">
              {chapterList.map((ch, i) => (
                <div
                  key={ch.id}
                  className="flex items-center gap-4 border-b border-border px-7 py-3.5 transition-colors duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] last:border-b-0 hover:bg-background/60 dark:border-border dark:hover:bg-accent"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted/70 text-[11px] font-semibold tabular-nums text-muted-foreground dark:bg-card dark:text-muted-foreground">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[14px] text-muted-foreground dark:text-muted-foreground">
                    {ch.title || `Chapter ${i + 1}`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/* ─── Stat cell for hero footer ─── */
function StatCell({
  icon,
  label,
  value,
  last = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 px-4 py-3 sm:gap-3 sm:px-8 sm:py-5 ${last ? "" : "border-r border-border dark:border-border"}`}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-background dark:bg-card">
        {icon}
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground dark:text-muted-foreground">
          {label}
        </p>
        <p className="text-[16px] font-bold leading-tight text-foreground dark:text-foreground">
          {value}
        </p>
      </div>
    </div>
  );
}
