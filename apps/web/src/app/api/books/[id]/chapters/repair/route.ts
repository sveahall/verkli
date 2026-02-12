import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertPublicEnv } from "@/lib/env";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { repairImportedChapterTitles } from "@/lib/import-extract";
import {
  apiError,
  E_BOOK_NOT_FOUND,
  E_DATABASE_ERROR,
  E_INVALID_BOOK_VERSION,
  E_INVALID_JSON,
} from "@/lib/api-errors";

type RepairPayload = {
  bookVersionId?: unknown;
};

type ChapterRow = {
  id: string;
  title: string | null;
  order: number | null;
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

  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

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

  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("id, author_id")
    .eq("id", bookId)
    .maybeSingle();

  if (bookError) {
    console.error("[chapters.repair] book lookup failed", {
      bookId,
      userId: user.id,
      code: bookError.code,
      message: bookError.message,
    });
    return apiError(E_DATABASE_ERROR, 500);
  }

  if (!book || book.author_id !== user.id) {
    return apiError(E_BOOK_NOT_FOUND, 404);
  }

  let targetVersionId = requestedVersionId;
  if (!targetVersionId) {
    const { data: latestVersion, error: latestVersionError } = await supabase
      .from("book_versions")
      .select("id")
      .eq("book_id", bookId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestVersionError) {
      console.error("[chapters.repair] latest version lookup failed", {
        bookId,
        userId: user.id,
        code: latestVersionError.code,
        message: latestVersionError.message,
      });
      return apiError(E_DATABASE_ERROR, 500);
    }

    targetVersionId = latestVersion?.id ?? null;
  } else {
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

  const { data: chapterRows, error: chapterError } = await supabase
    .from("chapters")
    .select("id, title, order")
    .eq("book_id", bookId)
    .eq("book_version_id", targetVersionId)
    .order("order", { ascending: true });

  if (chapterError) {
    console.error("[chapters.repair] chapter load failed", {
      bookId,
      userId: user.id,
      targetVersionId,
      code: chapterError.code,
      message: chapterError.message,
    });
    return apiError(E_DATABASE_ERROR, 500);
  }

  const chapters = (chapterRows ?? []) as ChapterRow[];
  if (chapters.length === 0) {
    return NextResponse.json({
      ok: true,
      changed: false,
      targetVersionId,
      updatedCount: 0,
      totalCount: 0,
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

  return NextResponse.json({
    ok: true,
    changed: updates.length > 0,
    targetVersionId,
    updatedCount: updates.length,
    totalCount: chapters.length,
    updatedTitles: updates.slice(0, 5).map((item) => ({
      from: item.before,
      to: item.after,
    })),
  });
}
