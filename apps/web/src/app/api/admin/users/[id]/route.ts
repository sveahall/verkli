import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserEmail } from "@/lib/admin/user-emails";
import { requireAdminRoleForApi } from "@/lib/admin-auth";
import {
  apiError,
  E_DATABASE_ERROR,
  E_INVALID_USER_ID,
  E_USER_NOT_FOUND,
  isValidUuid,
} from "@/lib/api-errors";
import { getAvatarUrlFromPathServer } from "@/lib/supabase/avatar";

/**
 * Admin user-detail bundle. Returns everything the admin panel needs to answer
 * "who is this user" in a single round trip: profile, email, beta flag, authored
 * books (with a status breakdown), reading activity, billing, and the per-user
 * audit trail. All reads use the service-role client and are batched.
 */

type BookStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

type ProfileRow = {
  user_id: string;
  role: string | null;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  cover_image: string | null;
  website_url: string | null;
  social_links: Record<string, unknown> | null;
  is_public: boolean;
  preferences: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
};

type AuthoredBook = {
  id: string;
  title: string;
  status: BookStatus;
  created_at: string;
};

type ReadingRow = {
  book_id: string;
  progress_percent: number;
  last_read_at: string;
  current_chapter: number;
};

type AuditRow = {
  id: string;
  action: string;
  actor_user_id: string | null;
  actor_role: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
};

const BOOK_LIST_LIMIT = 8;
const READING_LIMIT = 8;
const AUDIT_LIMIT = 25;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireAdminRoleForApi();
  if (response) return response;

  const { id } = await params;
  if (!id || !isValidUuid(id)) {
    return apiError(E_INVALID_USER_ID, 400);
  }

  const admin = createAdminClient();

  // Core profile first — if there is no profile, the user does not exist as far
  // as this panel is concerned.
  const { data: profileData, error: profileError } = await admin
    .from("profiles")
    .select(
      "user_id, role, display_name, username, avatar_url, bio, cover_image, website_url, social_links, is_public, preferences, created_at, updated_at"
    )
    .eq("user_id", id)
    .maybeSingle();

  if (profileError) {
    console.error("[admin/users/:id] profile load failed:", profileError.message);
    return apiError(E_DATABASE_ERROR, 500);
  }
  if (!profileData) {
    return apiError(E_USER_NOT_FOUND, 404);
  }

  const profile = profileData as ProfileRow;

  // Everything else is independent — batch it.
  const [
    emailRes,
    flagRes,
    booksRes,
    lastSeenRes,
    readingsRes,
    billingRes,
    auditRes,
  ] = await Promise.all([
    getUserEmail(id),
    admin
      .from("user_flags")
      .select("beta_enabled")
      .eq("user_id", id)
      .maybeSingle(),
    admin
      .from("books")
      .select("id, title, status, created_at")
      .eq("author_id", id)
      .order("created_at", { ascending: false }),
    admin
      .from("analytics_events")
      .select("created_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("readings")
      .select("book_id, progress_percent, last_read_at, current_chapter")
      .eq("user_id", id)
      .order("last_read_at", { ascending: false })
      .limit(READING_LIMIT),
    admin
      .from("billing_accounts")
      .select("plan, status, current_period_end, cancel_at_period_end")
      .eq("user_id", id)
      // billing_accounts PK is (user_id, role); a dual-role user has >1 row.
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("audit_log")
      .select("id, action, actor_user_id, actor_role, meta, created_at")
      .eq("entity_type", "user")
      .eq("entity_id", id)
      .order("created_at", { ascending: false })
      .limit(AUDIT_LIMIT),
  ]);

  const email =
    emailRes ?? null;

  const betaEnabled =
    (flagRes.data as { beta_enabled: boolean } | null)?.beta_enabled ?? false;

  // ── Authored books: count + status breakdown + short list ──────────────────
  const allBooks = (booksRes.data ?? []) as AuthoredBook[];
  const statusBreakdown: Record<BookStatus, number> = {
    DRAFT: 0,
    PUBLISHED: 0,
    ARCHIVED: 0,
  };
  for (const book of allBooks) {
    if (book.status in statusBreakdown) {
      statusBreakdown[book.status] += 1;
    }
  }
  const books = allBooks.slice(0, BOOK_LIST_LIMIT);

  // ── Reading activity: resolve book titles in one batched lookup ────────────
  const readings = (readingsRes.data ?? []) as ReadingRow[];
  const readingBookIds = [...new Set(readings.map((r) => r.book_id))];
  const titleMap = new Map<string, string>();
  if (readingBookIds.length > 0) {
    const { data: readingBooks } = await admin
      .from("books")
      .select("id, title")
      .in("id", readingBookIds);
    for (const b of (readingBooks ?? []) as Array<{ id: string; title: string }>) {
      titleMap.set(b.id, b.title);
    }
  }
  const inProgress = readings.map((r) => ({
    book_id: r.book_id,
    book_title: titleMap.get(r.book_id) ?? null,
    progress_percent: r.progress_percent,
    current_chapter: r.current_chapter,
    last_read_at: r.last_read_at,
  }));

  const billing = billingRes.data
    ? (billingRes.data as {
        plan: string | null;
        status: string | null;
        current_period_end: string | null;
        cancel_at_period_end: boolean;
      })
    : null;

  const audit = (auditRes.data ?? []) as AuditRow[];

  const avatarUrl = await getAvatarUrlFromPathServer(profile.avatar_url);

  return NextResponse.json({
    user: {
      user_id: profile.user_id,
      email,
      role: profile.role,
      display_name: profile.display_name,
      username: profile.username,
      avatar_url: avatarUrl,
      bio: profile.bio,
      website_url: profile.website_url,
      is_public: profile.is_public,
      social_links: normalizeSocialLinks(profile.social_links),
      beta_enabled: betaEnabled,
      created_at: profile.created_at,
      updated_at: profile.updated_at,
      last_seen_at:
        (lastSeenRes.data as { created_at: string } | null)?.created_at ?? null,
    },
    books: {
      total: allBooks.length,
      breakdown: statusBreakdown,
      list: books,
    },
    activity: {
      in_progress: inProgress,
    },
    billing,
    audit,
  });
}

/**
 * social_links is a free-form Json column. Coerce it into a flat
 * { platform: url } string map for safe rendering, dropping non-string values.
 */
function normalizeSocialLinks(
  raw: Record<string, unknown> | null
): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" && value.trim() !== "") {
      out[key] = value.trim();
    }
  }
  return out;
}
