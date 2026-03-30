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
  Trash2,
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
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-slate-400 transition-colors duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-slate-100 hover:text-slate-600 dark:text-white/30 dark:hover:bg-white/[0.04] dark:hover:text-white/60"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Library
        </Link>
        <div className="flex items-center gap-2.5">
          {isPublished && (
            <Link
              href={`/reader/books/${id}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-4 py-2 text-[13px] font-medium text-slate-500 transition-[border-color,color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:border-slate-300 hover:text-slate-700 active:scale-[0.97] dark:border-white/10 dark:text-white/40 dark:hover:border-white/20"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View as reader
            </Link>
          )}
          <Link
            href={`/author/books/${id}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-[13px] font-medium text-white transition-[transform,background-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-slate-800 active:scale-[0.97] dark:bg-white dark:text-slate-900 dark:hover:bg-white/90"
          >
            <PenLine className="h-3.5 w-3.5" />
            Edit book
          </Link>
          <DeleteBookButton
            bookId={id}
            bookTitle={b.title}
            redirectTo="/author/library"
            label=""
            className="inline-flex items-center justify-center rounded-full border border-slate-200 p-2 text-slate-400 transition-[border-color,color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:border-red-200 hover:text-red-500 active:scale-[0.97] dark:border-white/10 dark:text-white/30 dark:hover:border-red-800 dark:hover:text-red-400"
          />
        </div>
      </nav>

      {/* ── Hero card (cover + info + stats footer) ── */}
      <section className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white dark:border-white/[0.08] dark:bg-white/[0.04]">
        <div className="flex flex-col gap-8 p-8 pb-0 sm:flex-row sm:items-start sm:gap-10">
          {/* Cover — the star of the page */}
          <div className="relative mx-auto h-[296px] w-[200px] shrink-0 overflow-hidden rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.12),0_2px_6px_rgba(0,0,0,0.06)] sm:mx-0 dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
            {b.cover_image ? (
              <Image
                src={b.cover_image}
                alt=""
                fill
                sizes="200px"
                className="object-cover"
                unoptimized
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-50 dark:from-white/[0.06] dark:to-white/[0.02]">
                <BookOpen className="h-10 w-10 text-slate-200 dark:text-white/10" />
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

            <h1 className="mt-4 text-[30px] font-bold leading-[1.15] tracking-[-0.025em] text-slate-900 dark:text-white">
              {b.title}
            </h1>

            {b.description ? (
              <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-slate-500 dark:text-white/45">
                {b.description}
              </p>
            ) : (
              <p className="mt-3 text-[15px] italic text-slate-300 dark:text-white/20">
                No description added yet.
              </p>
            )}

          </div>
        </div>

        {/* Stats footer — horizontal strip inside the hero card */}
        <div className="grid grid-cols-2 border-t border-slate-100 lg:grid-cols-4 dark:border-white/[0.06]">
          <StatCell
            icon={<Globe className="h-4 w-4 text-blue-500" />}
            label="Language"
            value={lang(b.language ?? "en")}
          />
          <StatCell
            icon={<BookText className="h-4 w-4 text-[#7c5cfc]" />}
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
          <section className="rounded-2xl border border-slate-200/60 bg-white p-6 dark:border-white/[0.08] dark:bg-white/[0.04]">
            <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-white/30">
              <Globe className="h-3.5 w-3.5" />
              Available in
            </h2>
            <div className="mt-4 space-y-2">
              {availableLanguages.map((l) => (
                <div
                  key={l.code}
                  className="flex items-center justify-between rounded-xl bg-slate-50/80 px-4 py-3 dark:bg-white/[0.03]"
                >
                  <div className="flex items-center gap-2.5">
                    <Languages className="h-4 w-4 text-blue-500" />
                    <span className="text-[14px] font-medium text-slate-700 dark:text-white/70">
                      {lang(l.code)}
                    </span>
                    {l.isOriginal && (
                      <span className="rounded-md bg-slate-200/50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-white/[0.06] dark:text-white/30">
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
                    <span className="text-[12px] text-slate-400 dark:text-white/25">
                      Draft
                    </span>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4 border-t border-slate-100 pt-3 dark:border-white/[0.05]">
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-slate-400 dark:text-white/30">
                  Pricing
                </span>
                <span className="font-semibold text-slate-700 dark:text-white/70">
                  {price()}
                </span>
              </div>
            </div>
          </section>

          {/* Audiobook */}
          <section className="rounded-2xl border border-slate-200/60 bg-white p-6 dark:border-white/[0.08] dark:bg-white/[0.04]">
            <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-white/30">
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
                      <span className="text-[14px] font-medium text-slate-700 dark:text-white/70">
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
                <div className="mt-3 border-t border-slate-100 pt-3 dark:border-white/[0.05]">
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-slate-400 dark:text-white/30">
                      Total
                    </span>
                    <span className="font-semibold text-slate-700 dark:text-white/70">
                      {dur(totalAudioSec)}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex flex-col items-center rounded-xl border border-dashed border-slate-200 py-8 dark:border-white/[0.08]">
                <Headphones className="h-6 w-6 text-slate-200 dark:text-white/10" />
                <p className="mt-2 text-[13px] text-slate-400 dark:text-white/25">
                  No audiobook yet.
                </p>
                <Link
                  href={`/author/books/${id}?panel=audiobook`}
                  className="mt-3 rounded-full border border-[#8E79FF]/30 px-3.5 py-1 text-[12px] font-medium text-[#7c5cfc] transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-[#8E79FF]/5 active:scale-[0.97] dark:text-[#B4A0FF]"
                >
                  Generate audiobook
                </Link>
              </div>
            )}
          </section>
        </div>

        {/* Right: Chapters */}
        <section className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white dark:border-white/[0.08] dark:bg-white/[0.04]">
          <div className="flex items-center justify-between border-b border-slate-100 px-7 py-4 dark:border-white/[0.05]">
            <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-white/30">
              <BookText className="h-3.5 w-3.5" />
              Chapters
            </h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[12px] tabular-nums font-semibold text-slate-500 dark:bg-white/[0.06] dark:text-white/40">
              {chapterList.length}
            </span>
          </div>
          {chapterList.length === 0 ? (
            <p className="px-7 py-12 text-center text-[14px] text-slate-300 dark:text-white/20">
              No chapters yet.
            </p>
          ) : (
            <div className="max-h-[560px] overflow-y-auto">
              {chapterList.map((ch, i) => (
                <div
                  key={ch.id}
                  className="flex items-center gap-4 border-b border-slate-50 px-7 py-3.5 transition-colors duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] last:border-b-0 hover:bg-slate-50/60 dark:border-white/[0.03] dark:hover:bg-white/[0.02]"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100/70 text-[11px] font-semibold tabular-nums text-slate-400 dark:bg-white/[0.05] dark:text-white/25">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[14px] text-slate-600 dark:text-white/60">
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
      className={`flex items-center gap-3 px-8 py-5 ${last ? "" : "border-r border-slate-100 dark:border-white/[0.06]"}`}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-50 dark:bg-white/[0.04]">
        {icon}
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400 dark:text-white/25">
          {label}
        </p>
        <p className="text-[16px] font-bold leading-tight text-slate-800 dark:text-white/80">
          {value}
        </p>
      </div>
    </div>
  );
}
