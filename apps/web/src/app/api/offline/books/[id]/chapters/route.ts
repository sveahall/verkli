import { NextResponse } from "next/server";
import {
  apiError,
  E_BOOK_NOT_FOUND,
  E_INVALID_JSON,
  E_OFFLINE_CHAPTER_LOAD_FAILED,
  E_VALIDATION_FAILED,
} from "@/lib/api-errors";
import { buildChapterContentHash } from "@/lib/offline/hash";
import { requireOfflineBookAccess } from "@/lib/offline/server";
import type { OfflineChapterPayload, OfflineChaptersResponse } from "@/lib/offline/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BATCH_SIZE = 50;

type ChapterRow = {
  id: string;
  title: string;
  order: number;
  content: string | null;
  updated_at: string | null;
};

type BatchRequestBody = {
  bookVersionId?: string;
  chapterIds?: string[];
};

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function validateBody(raw: unknown): { ok: true; body: Required<BatchRequestBody> } | { ok: false; response: Response } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, response: apiError(E_VALIDATION_FAILED, 400) };
  }

  const parsed = raw as BatchRequestBody;
  const bookVersionId = String(parsed.bookVersionId ?? "").trim();
  if (!isUuid(bookVersionId)) {
    return { ok: false, response: apiError(E_VALIDATION_FAILED, 400, { details: { bookVersionId: "invalid" } }) };
  }

  if (!Array.isArray(parsed.chapterIds) || parsed.chapterIds.length === 0) {
    return { ok: false, response: apiError(E_VALIDATION_FAILED, 400, { details: { chapterIds: "required" } }) };
  }
  if (parsed.chapterIds.length > MAX_BATCH_SIZE) {
    return {
      ok: false,
      response: apiError(E_VALIDATION_FAILED, 400, {
        details: { chapterIds: `max_${MAX_BATCH_SIZE}` },
      }),
    };
  }

  const chapterIds = parsed.chapterIds.map((value) => String(value).trim());
  if (chapterIds.some((value) => !isUuid(value))) {
    return { ok: false, response: apiError(E_VALIDATION_FAILED, 400, { details: { chapterIds: "invalid" } }) };
  }

  return {
    ok: true,
    body: {
      bookVersionId,
      chapterIds: Array.from(new Set(chapterIds)),
    },
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const access = await requireOfflineBookAccess({ bookId: id });
  if (!access.ok) {
    return access.response;
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return apiError(E_INVALID_JSON, 400);
  }

  const validated = validateBody(rawBody);
  if (!validated.ok) {
    return validated.response;
  }

  const { supabase, userId, book, activeVersion } = access.context;
  const requestedVersionId = validated.body.bookVersionId;

  if (requestedVersionId !== activeVersion.id) {
    const { data: version, error: versionError } = await supabase
      .from("book_versions")
      .select("id")
      .eq("id", requestedVersionId)
      .eq("book_id", book.id)
      .not("published_at", "is", null)
      .maybeSingle();

    if (versionError) {
      console.error("[offline.chapters] version lookup failed", {
        userId,
        bookId: book.id,
        requestedVersionId,
        code: versionError.code,
        message: versionError.message,
      });
      return apiError(E_OFFLINE_CHAPTER_LOAD_FAILED, 500);
    }

    if (!version) {
      return apiError(E_BOOK_NOT_FOUND, 404);
    }
  }

  const chapterIds = validated.body.chapterIds;
  const { data: chapters, error: chaptersError } = await supabase
    .from("chapters")
    .select("id, title, order, content, updated_at")
    .eq("book_id", book.id)
    .eq("book_version_id", requestedVersionId)
    .in("id", chapterIds);

  if (chaptersError) {
    console.error("[offline.chapters] chapters lookup failed", {
      userId,
      bookId: book.id,
      requestedVersionId,
      code: chaptersError.code,
      message: chaptersError.message,
    });
    return apiError(E_OFFLINE_CHAPTER_LOAD_FAILED, 500);
  }

  const rows = (chapters ?? []) as ChapterRow[];
  const rowsById = new Map(rows.map((chapter) => [chapter.id, chapter]));
  const missingChapterIds = chapterIds.filter((chapterId) => !rowsById.has(chapterId));
  if (missingChapterIds.length > 0) {
    return apiError(E_VALIDATION_FAILED, 400, {
      details: { chapterIds: "unknown" },
      missingChapterIds,
    });
  }

  const orderedChapters = chapterIds
    .map((chapterId) => rowsById.get(chapterId))
    .filter((row): row is ChapterRow => Boolean(row));

  const payloadChapters = await Promise.all(
    orderedChapters.map(async (chapter): Promise<OfflineChapterPayload> => ({
      id: chapter.id,
      title: chapter.title,
      order: chapter.order,
      content: chapter.content ?? "",
      contentHash: await buildChapterContentHash({
        title: chapter.title,
        content: chapter.content,
      }),
      updatedAt: chapter.updated_at ?? null,
      readerUrl: `/reader/read/${chapter.id}`,
    }))
  );

  const payload: OfflineChaptersResponse = {
    bookId: book.id,
    bookVersionId: requestedVersionId,
    chapters: payloadChapters,
  };

  return NextResponse.json(payload);
}
