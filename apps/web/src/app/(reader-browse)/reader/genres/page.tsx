import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Genres",
  description:
    "Explore books by genre on Verkli. Find exactly what you want to read.",
  openGraph: {
    title: "Genres | Verkli",
    description: "Explore books by genre on Verkli.",
  },
};
import { getDiscoveryEnabled } from "@/lib/flags";
import { getLanguageLabel, LANGUAGE_OPTIONS, normalizeLanguage, type SupportedLanguage } from "@/lib/languages";
import EmptyState from "@/components/reader/EmptyState";
import PageHeader from "@/components/reader/PageHeader";

type SearchParams = { lang?: string };

async function getCuratedLists(
  supabase: Awaited<ReturnType<typeof createClient>>,
  language: SupportedLanguage
) {
  const base = supabase
    .from("curated_lists")
    .select("id, slug, title, description, language")
    .eq("is_active", true)
    .order("title");

  const { data, error } =
    language === "en"
      ? await base.or("language.eq.en,language.is.null")
      : await base.eq("language", language);

  return { lists: data ?? [], error };
}

export default async function ReaderGenresPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const language = normalizeLanguage(params?.lang);
  const supabase = await createClient();
  const discoveryEnabled = getDiscoveryEnabled();

  if (!discoveryEnabled) {
    return (
      <div className="section-gap-lg">
        <PageHeader
        className="md:flex-col md:items-start"
          eyebrow="Discover"
          title="Genres"
          subtitle="Curated collections by genre and theme."
        />
        <EmptyState
          title="No genres to show yet"
          description="Check back later for curated collections."
          action={
            <Link href="/reader/home" className="btn-secondary">
              Back to Home
            </Link>
          }
        />
      </div>
    );
  }

  const { lists, error } = await getCuratedLists(supabase, language);

  if (error) {
    return (
      <div className="section-gap-lg">
        <PageHeader
        className="md:flex-col md:items-start"
          eyebrow="Discover"
          title="Genres"
          subtitle="Curated collections by genre and theme."
        />
        <EmptyState
          title="Something went wrong"
          description="We couldn't load genres. Refresh the page or try again in a moment."
          action={
            <Link href="/reader/genres" className="btn-secondary">
              Retry
            </Link>
          }
        />
      </div>
    );
  }

  const listIds = lists.map((list) => list.id);
  const { data: listItems } = listIds.length
    ? await supabase.from("curated_list_items").select("list_id").in("list_id", listIds)
    : { data: [] };

  const counts = new Map<string, number>();
  (listItems ?? []).forEach((item) => {
    counts.set(item.list_id, (counts.get(item.list_id) ?? 0) + 1);
  });

  const langLabel = getLanguageLabel(language);

  return (
    <div className="section-gap-lg">
      <PageHeader
        className="md:flex-col md:items-start"
        eyebrow="Discover"
        title="Genres"
        subtitle={`Curated collections in ${langLabel}.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Language</span>
            <div className="flex flex-wrap gap-1">
              {LANGUAGE_OPTIONS.map((opt) => (
                <Link
                  key={opt.value}
                  href={opt.value === "en" ? "/reader/genres" : `/reader/genres?lang=${opt.value}`}
                  className={`inline-flex min-h-11 items-center rounded-full px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    opt.value === language
                      ? "bg-foreground text-white dark:text-background"
                      : "bg-muted text-foreground hover:bg-muted dark:bg-card dark:hover:bg-card"
                  }`}
                >
                  {opt.label}
                </Link>
              ))}
            </div>
          </div>
        }
      />

      {lists.length === 0 ? (
        <EmptyState
          title="No genres yet"
          description="New curated lists appear as books are added."
          action={
            <Link href="/reader/discover" className="btn-primary">
              Discover books
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {lists.map((list) => (
            <Link
              key={list.id}
              href={`/reader/lists/${list.slug}`}
              className="group rounded-2xl border border-border bg-card/80 px-5 py-5 shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition-[background-color,border-color,color,box-shadow] hover:border-border hover:shadow-[0_16px_32px_rgba(15,23,42,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:bg-card dark:hover:border-border dark:hover:shadow-[0_14px_30px_rgba(0,0,0,0.35)] dark:focus-visible:ring-offset-background"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[16px] font-medium text-foreground font-display">
                    {list.title}
                  </h3>
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    {list.description ?? "Hand-picked books from this genre and theme."}
                  </p>
                </div>
                <span className="rounded-full bg-muted px-3 py-1 text-[12px] font-medium text-muted-foreground dark:bg-card">
                  {counts.get(list.id) ?? 0} books
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
