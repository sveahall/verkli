import { NextResponse } from "next/server";
import { assertPublicEnv } from "@/lib/env";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { createClient } from "@/lib/supabase/server";
import { getBookAsOwner, getChaptersForBook } from "@/lib/books/service";
import { apiError, E_BOOK_NOT_FOUND, E_DATABASE_ERROR, E_INVALID_BOOK_ID, isValidUuid } from "@/lib/api-errors";

function extractText(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map((item) => extractText(item)).join(" ");
  if (typeof node !== "object") return "";

  const maybeNode = node as { text?: unknown; content?: unknown };
  const ownText = typeof maybeNode.text === "string" ? maybeNode.text : "";
  const nested = extractText(maybeNode.content);
  return `${ownText} ${nested}`.trim();
}

function normalizeChapterText(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  const extracted = extractText(value).replace(/\s+/g, " ").trim();
  if (extracted.length > 0) return extracted;

  try {
    return JSON.stringify(value ?? "");
  } catch {
    return "";
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  assertPublicEnv();
  const { id: bookId } = await params;
  if (!isValidUuid(bookId)) return apiError(E_INVALID_BOOK_ID, 400);

  // Auth
  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  const supabase = await createClient();

  // Ownership check
  const bookResult = await getBookAsOwner(supabase, bookId, user.id, "id, author_id");
  if (!bookResult.ok) {
    return apiError(
      bookResult.error === "book_not_found" ? E_BOOK_NOT_FOUND : E_DATABASE_ERROR,
      bookResult.error === "book_not_found" ? 404 : 500,
    );
  }

  // Fetch chapters (resolves latest version internally)
  const chaptersResult = await getChaptersForBook(supabase, bookId, {
    select: "id, title, content, order",
  });
  if (!chaptersResult.ok) {
    return apiError(E_DATABASE_ERROR, 500);
  }

  // Response
  type ChapterData = { id: string; title: string | null; content: unknown; order: number | null };
  const chapters = (chaptersResult.data as unknown as ChapterData[]).map((chapter, index) => ({
    id: chapter.id,
    title: chapter.title?.trim() || `Chapter ${index + 1}`,
    text: normalizeChapterText(chapter.content),
    order: typeof chapter.order === "number" ? chapter.order : index,
  }));

  return NextResponse.json({ ok: true, data: { chapters } });
}
