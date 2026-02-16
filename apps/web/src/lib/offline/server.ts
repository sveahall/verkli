import { canUserReadBook } from "@/lib/books/access";
import { getBillingStateForUser } from "@/lib/billing/server";
import { isOfflineReadingEnabled } from "@/lib/flags";
import { normalizeLanguage, normalizeLanguageOrNull } from "@/lib/languages";
import { createClient } from "@/lib/supabase/server";
import {
  apiError,
  E_BOOK_NOT_FOUND,
  E_DATABASE_ERROR,
  E_FORBIDDEN,
  E_OFFLINE_FEATURE_DISABLED,
  E_PLUS_SUBSCRIPTION_REQUIRED,
  E_UNAUTHORIZED,
} from "@/lib/api-errors";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type OfflineBookRow = {
  id: string;
  status: string | null;
  author_id: string;
  language: string | null;
  original_language: string | null;
  price_amount: number | null;
  pricing_model: string | null;
};

type OfflineVersionRow = {
  id: string;
  book_id: string;
  language_code: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type OfflineBookAccessContext = {
  supabase: SupabaseServerClient;
  userId: string;
  book: OfflineBookRow;
  activeVersion: OfflineVersionRow;
  activeLanguageCode: string;
};

type OfflineBookAccessArgs = {
  bookId: string;
  requestedLanguage?: string | null;
};

function resolveVersion(
  versions: OfflineVersionRow[],
  requestedLanguage: string | null,
  fallbackLanguage: string
): OfflineVersionRow | null {
  const requested = normalizeLanguageOrNull(requestedLanguage);
  const fallback = normalizeLanguage(fallbackLanguage);

  return (
    (requested ? versions.find((row) => normalizeLanguage(row.language_code) === requested) : null) ??
    versions.find((row) => normalizeLanguage(row.language_code) === fallback) ??
    versions[0] ??
    null
  );
}

export async function requireOfflineBookAccess(
  args: OfflineBookAccessArgs
):
  Promise<{ ok: true; context: OfflineBookAccessContext } | { ok: false; response: Response }> {
  if (!isOfflineReadingEnabled()) {
    return { ok: false, response: apiError(E_OFFLINE_FEATURE_DISABLED, 503) };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, response: apiError(E_UNAUTHORIZED, 401) };
  }

  const billing = await getBillingStateForUser(user.id, "reader");
  if (!billing.ok) {
    return billing;
  }
  if (!billing.state.isPlusActive) {
    return { ok: false, response: apiError(E_PLUS_SUBSCRIPTION_REQUIRED, 403) };
  }

  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("id, status, author_id, language, original_language, price_amount, pricing_model")
    .eq("id", args.bookId)
    .maybeSingle();

  if (bookError) {
    console.error("[offline] failed to load book", {
      bookId: args.bookId,
      userId: user.id,
      code: bookError.code,
      message: bookError.message,
    });
    return { ok: false, response: apiError(E_DATABASE_ERROR, 500) };
  }

  const bookRow = book as OfflineBookRow | null;
  if (!bookRow || String(bookRow.status ?? "").toUpperCase() !== "PUBLISHED") {
    return { ok: false, response: apiError(E_BOOK_NOT_FOUND, 404) };
  }

  const hasReadAccess = await canUserReadBook({
    supabase,
    userId: user.id,
    bookId: bookRow.id,
    bookAuthorId: bookRow.author_id,
    bookPriceAmount: bookRow.price_amount,
    bookPricingModel: bookRow.pricing_model,
  });
  if (!hasReadAccess) {
    return { ok: false, response: apiError(E_FORBIDDEN, 403) };
  }

  const { data: versions, error: versionsError } = await supabase
    .from("book_versions")
    .select("id, book_id, language_code, published_at, created_at, updated_at")
    .eq("book_id", bookRow.id)
    .not("published_at", "is", null)
    .order("created_at", { ascending: true });

  if (versionsError) {
    console.error("[offline] failed to load book versions", {
      bookId: args.bookId,
      userId: user.id,
      code: versionsError.code,
      message: versionsError.message,
    });
    return { ok: false, response: apiError(E_DATABASE_ERROR, 500) };
  }

  const versionRows = (versions ?? []) as OfflineVersionRow[];
  const fallbackLanguage = bookRow.original_language ?? bookRow.language ?? "en";
  const activeVersion = resolveVersion(versionRows, args.requestedLanguage ?? null, fallbackLanguage);

  if (!activeVersion) {
    return { ok: false, response: apiError(E_BOOK_NOT_FOUND, 404) };
  }

  return {
    ok: true,
    context: {
      supabase,
      userId: user.id,
      book: bookRow,
      activeVersion,
      activeLanguageCode: normalizeLanguage(activeVersion.language_code),
    },
  };
}
