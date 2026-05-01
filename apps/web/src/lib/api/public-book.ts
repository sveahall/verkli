import { normalizePrintOnDemandSettings } from "@/lib/print-on-demand";
import { normalizeLanguage } from "@/lib/languages";

export type PublicBookFormat = "text" | "audio" | "print";

export type PublicBookPricing = {
  is_free: boolean;
  amount_minor: number | null;
  currency: "SEK" | "EUR" | "USD";
  model: "book_only" | "per_chapter";
};

export type PublicBookAuthor = {
  id: string;
  name: string;
  username: string | null;
  url: string;
};

export type PublicBookSummary = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  cover_image_url: string | null;
  language: string | null;
  formats: PublicBookFormat[];
  pricing: PublicBookPricing;
  author: PublicBookAuthor;
  canonical_url: string;
  updated_at: string;
  published_at: string | null;
};

export type PublicBookDetail = PublicBookSummary & {
  genres: string[];
  available_languages: string[];
  preview_url: string | null;
  trailer_url: string | null;
};

export type BookRow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  cover_image: string | null;
  author_id: string;
  language: string | null;
  original_language: string | null;
  audiobook_status: string | null;
  print_on_demand_settings: unknown;
  trailer_url: string | null;
  price_amount: number | null;
  price_currency: string;
  pricing_model: string;
  is_free: boolean | null;
  status: string;
  published_at: string | null;
  updated_at: string;
};

export type AuthorRow = {
  user_id: string;
  display_name: string | null;
  username: string | null;
};

export type GenreRow = {
  name_en: string | null;
  name: string;
};

export type VersionRow = {
  language_code: string | null;
  published_at: string | null;
};

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://verkli.com";
}

function normalizeCurrency(value: string): "SEK" | "EUR" | "USD" {
  const v = value.trim().toUpperCase();
  if (v === "SEK" || v === "EUR" || v === "USD") return v;
  return "USD";
}

function normalizeModel(value: string): "book_only" | "per_chapter" {
  return value === "per_chapter" ? "per_chapter" : "book_only";
}

export function buildFormats(book: BookRow): PublicBookFormat[] {
  const formats: PublicBookFormat[] = ["text"];
  if (book.audiobook_status === "published") {
    formats.push("audio");
  }
  const pod = normalizePrintOnDemandSettings(book.print_on_demand_settings);
  if (pod.enabled) {
    formats.push("print");
  }
  return formats;
}

export function buildPricing(book: BookRow): PublicBookPricing {
  const amount = typeof book.price_amount === "number" ? Math.trunc(book.price_amount) : null;
  const isFree = book.is_free === true || amount == null || amount <= 0;
  return {
    is_free: isFree,
    amount_minor: isFree ? null : amount,
    currency: normalizeCurrency(book.price_currency ?? "USD"),
    model: normalizeModel(book.pricing_model ?? "book_only"),
  };
}

export function buildAuthor(authorId: string, author: AuthorRow | null | undefined): PublicBookAuthor {
  return {
    id: authorId,
    name: author?.display_name?.trim() || author?.username || "Unknown author",
    username: author?.username ?? null,
    url: `${siteUrl()}/reader/authors/${authorId}`,
  };
}

function primaryLanguage(book: BookRow): string | null {
  const v = book.language ?? book.original_language ?? null;
  return v ? normalizeLanguage(v) : null;
}

export function toPublicBookSummary(
  book: BookRow,
  author: AuthorRow | null | undefined
): PublicBookSummary {
  return {
    id: book.id,
    slug: book.slug,
    title: book.title,
    description: book.description ?? null,
    cover_image_url: book.cover_image ?? null,
    language: primaryLanguage(book),
    formats: buildFormats(book),
    pricing: buildPricing(book),
    author: buildAuthor(book.author_id, author),
    canonical_url: `${siteUrl()}/reader/books/${book.id}`,
    updated_at: book.updated_at,
    published_at: book.published_at,
  };
}

export function toPublicBookDetail(
  book: BookRow,
  author: AuthorRow | null | undefined,
  genres: GenreRow[],
  versions: VersionRow[]
): PublicBookDetail {
  const summary = toPublicBookSummary(book, author);
  const availableLanguages = Array.from(
    new Set(
      versions
        .filter((v) => v.published_at && v.language_code)
        .map((v) => normalizeLanguage(v.language_code as string))
    )
  );
  const genreNames = genres
    .map((g) => g.name_en?.trim() || g.name?.trim())
    .filter((g): g is string => Boolean(g));

  return {
    ...summary,
    genres: genreNames,
    available_languages: availableLanguages,
    // TODO(ai-friendly): expose first-chapter preview URL once we have a stable
    // public preview endpoint. Currently first chapters are reachable inside
    // /reader/books/{id} but there is no dedicated preview route.
    preview_url: null,
    trailer_url: book.trailer_url ?? null,
  };
}

export const PUBLIC_BOOK_COLUMNS =
  "id, slug, title, description, cover_image, author_id, language, original_language, audiobook_status, print_on_demand_settings, trailer_url, price_amount, price_currency, pricing_model, is_free, status, published_at, updated_at";
