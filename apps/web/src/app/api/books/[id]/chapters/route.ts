import { NextResponse } from "next/server";
import { assertPublicEnv } from "@/lib/env";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { createClient } from "@/lib/supabase/server";
import { apiError, E_BOOK_NOT_FOUND, E_DATABASE_ERROR } from "@/lib/api-errors";

type ChapterRow = {
  id: string;
  title: string | null;
  content: unknown;
  order: number | null;
};

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

  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  const supabase = await createClient();

  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("id, author_id")
    .eq("id", bookId)
    .maybeSingle();

  if (bookError) {
    console.error("[asset studio source] book lookup failed", {
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

  const { data: latestVersion, error: versionError } = await supabase
    .from("book_versions")
    .select("id")
    .eq("book_id", bookId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (versionError) {
    console.error("[asset studio source] version lookup failed", {
      bookId,
      userId: user.id,
      code: versionError.code,
      message: versionError.message,
    });
    return apiError(E_DATABASE_ERROR, 500);
  }

  if (!latestVersion) {
    return NextResponse.json({ chapters: [] as Array<unknown> });
  }

  const { data: chapterRows, error: chapterError } = await supabase
    .from("chapters")
    .select("id, title, content, order")
    .eq("book_id", bookId)
    .eq("book_version_id", latestVersion.id)
    .order("order", { ascending: true });

  if (chapterError) {
    console.error("[asset studio source] chapter lookup failed", {
      bookId,
      userId: user.id,
      versionId: latestVersion.id,
      code: chapterError.code,
      message: chapterError.message,
    });
    return apiError(E_DATABASE_ERROR, 500);
  }

  const chapters = ((chapterRows ?? []) as ChapterRow[]).map((chapter, index) => ({
    id: chapter.id,
    title: chapter.title?.trim() || `Chapter ${index + 1}`,
    text: normalizeChapterText(chapter.content),
    order: typeof chapter.order === "number" ? chapter.order : index,
  }));

  return NextResponse.json({ chapters });
}
