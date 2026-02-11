import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  apiError,
  E_NOT_AUTHENTICATED,
  E_BOOK_NOT_FOUND,
  E_TRANSLATION_STATUS_FAILED,
} from "@/lib/api-errors";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bookId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_NOT_AUTHENTICATED, 401);
  }

  // Verify book ownership
  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("id, author_id")
    .eq("id", bookId)
    .maybeSingle();

  if (bookError || !book) {
    return apiError(E_BOOK_NOT_FOUND, 404);
  }

  if (book.author_id !== user.id) {
    return apiError(E_BOOK_NOT_FOUND, 404);
  }

  // Get all versions with their translation status
  const { data: versions, error: versionsError } = await supabase
    .from("book_versions")
    .select("id, language_code, status, created_at, updated_at")
    .eq("book_id", bookId)
    .order("created_at", { ascending: true });

  if (versionsError) {
    console.error("[translation-status] query failed", {
      bookId,
      message: versionsError.message,
    });
    return apiError(E_TRANSLATION_STATUS_FAILED, 500);
  }

  const rows = versions ?? [];

  // Check for active translation jobs
  const { data: jobs } = await supabase
    .from("ai_jobs")
    .select("id, status, progress, created_at")
    .eq("kind", "translation")
    .containedBy("input", { bookId })
    .order("created_at", { ascending: false })
    .limit(20);

  const jobMap = new Map<string, { status: string; progress: number }>();
  for (const job of jobs ?? []) {
    const input = job as unknown as { input?: { targetLanguage?: string } };
    const lang = (input.input as Record<string, unknown> | undefined)?.targetLanguage;
    if (typeof lang === "string" && !jobMap.has(lang)) {
      jobMap.set(lang, {
        status: String(job.status),
        progress: typeof job.progress === "number" ? job.progress : 0,
      });
    }
  }

  const translations = rows.map((v) => {
    const jobInfo = jobMap.get(v.language_code);
    let progress = 0;

    if (v.status === "done") {
      progress = 100;
    } else if (v.status === "translating" && jobInfo) {
      progress = jobInfo.progress;
    }

    return {
      language: v.language_code,
      status: v.status as "draft" | "translating" | "done" | "failed",
      progress,
    };
  });

  return NextResponse.json({ translations });
}
