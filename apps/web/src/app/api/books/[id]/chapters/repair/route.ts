import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertPublicEnv } from "@/lib/env";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { repairImportedChapterTitles } from "@/lib/import-extract";
import {
  getBookAsOwner,
  getLatestBookVersion,
  getChaptersForBook,
} from "@/lib/books/service";
import {
  apiError,
  E_BOOK_NOT_FOUND,
  E_DATABASE_ERROR,
  E_INVALID_BOOK_VERSION,
  E_INVALID_JSON,
  E_INVALID_BOOK_ID,
  isValidUuid,
} from "@/lib/api-errors";

type RepairPayload = {
  bookVersionId?: unknown;
};

function readOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeTitleForCompare(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  assertPublicEnv();
  const { id: bookId } = await params;
  if (!isValidUuid(bookId)) return apiError(E_INVALID_BOOK_ID, 400);

  // Auth
  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  // Validation
  let body: RepairPayload = {};
  try {
    const parsed = await request.json();
    if (parsed != null && (typeof parsed !== "object" || Array.isArray(parsed))) {
      return apiError(E_INVALID_JSON, 400);
    }
    body = (parsed ?? {}) as RepairPayload;
  } catch {
    return apiError(E_INVALID_JSON, 400);
  }

  const requestedVersionId = readOptionalString(body.bookVersionId);
  const supabase = await createClient();

  // Ownership check
  const bookResult = await getBookAsOwner(supabase, bookId, user.id, "id, author_id");
  if (!bookResult.ok) {
    return apiError(
      bookResult.error === "book_not_found" ? E_BOOK_NOT_FOUND : E_DATABASE_ERROR,
      bookResult.error === "book_not_found" ? 404 : 500,
    );
  }

  // Resolve target version
  let targetVersionId = requestedVersionId;
  if (!targetVersionId) {
    const versionResult = await getLatestBookVersion(supabase, bookId, { select: "id" });
    if (!versionResult.ok) {
      return apiError(E_DATABASE_ERROR, 500);
    }
    targetVersionId = versionResult.data?.id ?? null;
  } else {
    // Verify requested version belongs to this book
    const { data: version, error: versionError } = await supabase
      .from("book_versions")
      .select("id")
      .eq("id", targetVersionId)
      .eq("book_id", bookId)
      .maybeSingle();

    if (versionError) {
      console.error("[chapters.repair] version lookup failed", {
        bookId,
        userId: user.id,
        targetVersionId,
        code: versionError.code,
        message: versionError.message,
      });
      return apiError(E_DATABASE_ERROR, 500);
    }

    if (!version) {
      return apiError(E_INVALID_BOOK_VERSION, 400);
    }
  }

  if (!targetVersionId) {
    return apiError(E_INVALID_BOOK_VERSION, 400);
  }

  // Fetch chapters for version
  const chaptersResult = await getChaptersForBook(supabase, bookId, {
    versionId: targetVersionId,
    select: "id, title, order",
  });
  if (!chaptersResult.ok) {
    return apiError(E_DATABASE_ERROR, 500);
  }

  type ChapterSlim = { id: string; title: string | null; order: number | null };
  const chapters = chaptersResult.data as unknown as ChapterSlim[];
  if (chapters.length === 0) {
    return NextResponse.json({
      ok: true,
      data: { changed: false, targetVersionId, updatedCount: 0, totalCount: 0 },
    });
  }

  const originalTitles = chapters.map((chapter, index) => {
    const fallback = `Kapitel ${index + 1}`;
    const normalized = normalizeTitleForCompare(chapter.title ?? "");
    return normalized || fallback;
  });
  const repairedTitles = repairImportedChapterTitles(originalTitles);

  const updates = chapters
    .map((chapter, index) => {
      const before = originalTitles[index];
      const after = normalizeTitleForCompare(repairedTitles[index] ?? before);
      if (!after || before === after) return null;
      return { id: chapter.id, before, after };
    })
    .filter(Boolean) as Array<{ id: string; before: string; after: string }>;

  for (const update of updates) {
    const { error: updateError } = await supabase
      .from("chapters")
      .update({ title: update.after })
      .eq("id", update.id)
      .eq("book_id", bookId)
      .eq("book_version_id", targetVersionId);

    if (updateError) {
      console.error("[chapters.repair] chapter update failed", {
        bookId,
        userId: user.id,
        targetVersionId,
        chapterId: update.id,
        code: updateError.code,
        message: updateError.message,
      });
      return apiError(E_DATABASE_ERROR, 500);
    }
  }

  // Response
  return NextResponse.json({
    ok: true,
    data: {
      changed: updates.length > 0,
      targetVersionId,
      updatedCount: updates.length,
      totalCount: chapters.length,
      updatedTitles: updates.slice(0, 5).map((item) => ({
        from: item.before,
        to: item.after,
      })),
    },
  });
}
