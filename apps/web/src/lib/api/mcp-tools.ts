import { createAdminClient } from "@/lib/supabase/admin";
import {
  PUBLIC_BOOK_COLUMNS,
  toPublicBookDetail,
  toPublicBookSummary,
  type AuthorRow,
  type BookRow,
  type GenreRow,
  type VersionRow,
} from "@/lib/api/public-book";
import { isValidUuid } from "@/lib/api-errors";

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,150}[a-z0-9])?$/i;
const USERNAME_RE = /^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/i;

export type SearchBooksArgs = {
  q?: string;
  language?: string;
  is_free?: boolean;
  limit?: number;
};

export async function searchBooks(args: SearchBooksArgs) {
  const limit = Math.min(Math.max(args.limit ?? 10, 1), 25);
  const supabase = createAdminClient();
  let query = supabase
    .from("books")
    .select(PUBLIC_BOOK_COLUMNS)
    .eq("status", "PUBLISHED")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (args.q) query = query.ilike("title", `%${args.q}%`);
  if (args.language) query = query.eq("language", args.language.toLowerCase());
  if (typeof args.is_free === "boolean") query = query.eq("is_free", args.is_free);

  const { data, error } = await query;
  if (error) throw new Error(`search_books database error: ${error.message}`);
  const books = (data ?? []) as unknown as BookRow[];

  const authorIds = Array.from(new Set(books.map((b) => b.author_id)));
  let authors: AuthorRow[] = [];
  if (authorIds.length > 0) {
    const { data: rows } = await supabase
      .from("profiles")
      .select("user_id, display_name, username")
      .in("user_id", authorIds);
    authors = (rows ?? []) as unknown as AuthorRow[];
  }
  const authorMap = new Map(authors.map((a) => [a.user_id, a]));
  return books.map((b) => toPublicBookSummary(b, authorMap.get(b.author_id)));
}

export type GetBookArgs = { id: string };

export async function getBook(args: GetBookArgs) {
  const isUuid = isValidUuid(args.id);
  if (!isUuid && !SLUG_RE.test(args.id)) {
    throw new Error("get_book: id must be a UUID or a valid slug");
  }
  const supabase = createAdminClient();
  const lookupColumn = isUuid ? "id" : "slug";
  const { data: bookRow, error } = await supabase
    .from("books")
    .select(PUBLIC_BOOK_COLUMNS)
    .eq(lookupColumn, args.id)
    .eq("status", "PUBLISHED")
    .maybeSingle();
  if (error) throw new Error(`get_book database error: ${error.message}`);
  if (!bookRow) return null;
  const book = bookRow as unknown as BookRow;

  const [authorRes, genreRes, versionRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("user_id, display_name, username")
      .eq("user_id", book.author_id)
      .maybeSingle(),
    supabase.from("book_genres").select("genres(name, name_en)").eq("book_id", book.id),
    supabase
      .from("book_versions")
      .select("language_code, published_at")
      .eq("book_id", book.id),
  ]);
  const author = (authorRes.data ?? null) as AuthorRow | null;
  const genres: GenreRow[] = (
    (genreRes.data ?? []) as unknown as Array<{ genres: GenreRow | GenreRow[] | null }>
  ).flatMap((row) => {
    if (!row.genres) return [];
    return Array.isArray(row.genres) ? row.genres : [row.genres];
  });
  const versions = (versionRes.data ?? []) as unknown as VersionRow[];
  return toPublicBookDetail(book, author, genres, versions);
}

export type GetAuthorArgs = { id: string };

type ProfileRow = {
  user_id: string;
  display_name: string | null;
  username: string | null;
  bio: string | null;
  avatar_url: string | null;
  is_public: boolean | null;
  website_url: string | null;
  social_links: unknown;
};

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://verkli.com";
}

function extractSocialLinks(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const links: string[] = [];
  for (const v of Object.values(value as Record<string, unknown>)) {
    if (typeof v === "string" && v.startsWith("http")) links.push(v);
  }
  return links;
}

export async function getAuthor(args: GetAuthorArgs) {
  const isUuid = isValidUuid(args.id);
  if (!isUuid && !USERNAME_RE.test(args.id)) {
    throw new Error("get_author: id must be a UUID or a valid username");
  }
  const supabase = createAdminClient();
  const select =
    "user_id, display_name, username, bio, avatar_url, is_public, website_url, social_links";
  const profileRes = await (isUuid
    ? supabase.from("profiles").select(select).eq("user_id", args.id).maybeSingle()
    : supabase.from("profiles").select(select).eq("username", args.id).maybeSingle());

  if (profileRes.error) {
    throw new Error(`get_author database error: ${profileRes.error.message}`);
  }
  const profile = profileRes.data as ProfileRow | null;
  if (!profile) return null;

  const { data: bookRows, error: booksError } = await supabase
    .from("books")
    .select(PUBLIC_BOOK_COLUMNS)
    .eq("author_id", profile.user_id)
    .eq("status", "PUBLISHED")
    .order("updated_at", { ascending: false });
  if (booksError) {
    throw new Error(`get_author database error: ${booksError.message}`);
  }
  const books = (bookRows ?? []) as unknown as BookRow[];

  if (profile.is_public !== true && books.length === 0) return null;

  const authorRow: AuthorRow = {
    user_id: profile.user_id,
    display_name: profile.display_name,
    username: profile.username,
  };

  return {
    id: profile.user_id,
    name: profile.display_name?.trim() || profile.username || "Unknown author",
    username: profile.username,
    bio: profile.bio,
    avatar_url: profile.avatar_url,
    website_url: profile.website_url,
    same_as: extractSocialLinks(profile.social_links),
    canonical_url: `${siteUrl()}/reader/authors/${profile.user_id}`,
    books: books.map((b) => toPublicBookSummary(b, authorRow)),
  };
}

export const MCP_TOOL_DEFINITIONS = [
  {
    name: "search_books",
    description:
      "Search Verkli's published books. Returns up to 25 BookSummary objects with title, slug, formats, pricing, language, author and canonical_url. Use this first when an agent is browsing or recommending; follow up with get_book for full detail.",
    inputSchema: {
      type: "object",
      properties: {
        q: {
          type: "string",
          description: "Case-insensitive title search (substring match).",
        },
        language: {
          type: "string",
          description: "BCP-47 / ISO-639 code, e.g. 'en' or 'sv'.",
        },
        is_free: {
          type: "boolean",
          description: "If true, only free books. If false, only paid.",
        },
        limit: { type: "integer", minimum: 1, maximum: 25, default: 10 },
      },
    },
  },
  {
    name: "get_book",
    description:
      "Fetch a single published book by UUID or slug. Returns full BookDetail with genres, available_languages, formats, pricing, trailer_url and canonical_url. Returns null if the book does not exist or is not published.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string", description: "Book UUID or slug" },
      },
    },
  },
  {
    name: "get_author",
    description:
      "Fetch a public author profile by UUID or username. Returns name, bio, social links (same_as), canonical_url and the list of their published books as BookSummary objects. Private authors with no published books return null.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string", description: "Author UUID or username" },
      },
    },
  },
] as const;
