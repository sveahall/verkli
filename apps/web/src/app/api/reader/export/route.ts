import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiError, E_DATABASE_ERROR, E_UNAUTHORIZED } from "@/lib/api-errors";

const MAX_ROWS_PER_LIST = 10_000;
class ExportTooLargeError extends Error {}

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return apiError(E_UNAUTHORIZED, 401);

  try {
    const { data: profile, error } = await supabase.from("profiles")
      .select("preferences").eq("user_id", user.id).maybeSingle();
    if (error) throw new Error(`Could not read preferences: ${error.message}`);

    // Use the session client and an explicit owner filter on every page. Keyset
    // pagination on the unique id avoids silently truncating at the default row cap.
    // The export is bounded and fails as a whole if any list exceeds the limit.
    async function rows(table: "bookmarks" | "readings" | "listening_positions") {
      const all: Record<string, unknown>[] = [];
      let after: string | undefined;
      const columns = {
        bookmarks: "id,book_id,created_at",
        readings: "id,book_id,chapter_id,current_chapter,progress_percent,started_at,last_read_at",
        listening_positions: "id,book_id,chapter_id,position_seconds,duration_seconds,completed,created_at,updated_at",
      };
      while (true) {
        let query = supabase.from(table).select(columns[table]).eq("user_id", user!.id).order("id");
        if (after) query = query.gt("id", after);
        const { data, error: readError } = await query.limit(500);
        if (readError || !data) throw new Error(`Could not read ${table}: ${readError?.message ?? "No data returned"}`);
        const page = data as unknown as { id: string; [key: string]: unknown }[];
        if (all.length + page.length > MAX_ROWS_PER_LIST) {
          throw new ExportTooLargeError(`Reading data export exceeds 10,000 entries in ${table}. No partial file was created. Please contact support for a larger reading-data export.`);
        }
        all.push(...page);
        if (page.length < 500) return all;
        after = page[page.length - 1].id;
      }
    }

    const preferences = profile?.preferences;
    const readingPreferences = preferences && typeof preferences === "object" && !Array.isArray(preferences)
      ? preferences.reader ?? {} : {};
    const payload = {
      schemaVersion: 1,
      scope: "reading-data",
      exportedAt: new Date().toISOString(),
      coverage: {
        maxRowsPerList: MAX_ROWS_PER_LIST,
        truncated: false,
        consistency: "Lists are read sequentially. Changes made during the export may not be included.",
      },
      account: { id: user.id, email: user.email },
      readingPreferences,
      bookmarks: await rows("bookmarks"),
      readingProgress: await rows("readings"),
      listeningProgress: await rows("listening_positions"),
    };
    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="verkli-reading-data-${payload.exportedAt.slice(0, 10)}.json"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[reader export] export failed:", error instanceof Error ? error.message : "Unknown error");
    if (error instanceof ExportTooLargeError) {
      return NextResponse.json({ error: "READING_EXPORT_TOO_LARGE", detail: error.message }, { status: 413, headers: { "Cache-Control": "private, no-store" } });
    }
    return apiError(E_DATABASE_ERROR, 500);
  }
}
