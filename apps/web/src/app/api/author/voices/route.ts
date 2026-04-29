import { NextResponse } from "next/server";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError, E_GENERIC_ERROR } from "@/lib/api-errors";

// GET /api/author/voices — list the author's active voices.
//
// Returns soft-active rows (deleted_at IS NULL). For each row we return
// metadata sourced from our cache; the live ElevenLabs status is *not*
// fetched here (would 5x the latency of a list view). The voice library UI
// can lazy-load preview URLs per voice when the user opens detail.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuthorRoleForApi();
  if (!auth.user) return auth.response;

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("author_voices" as never)
    .select(
      "id, elevenlabs_voice_id, name, description, source, is_default, status, sample_storage_path, created_at, updated_at"
    )
    .eq("user_id", auth.user.id)
    .is("deleted_at", null)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[author.voices.list] failed", {
      userId: auth.user.id,
      message: error.message,
    });
    return apiError(E_GENERIC_ERROR, 500);
  }

  return NextResponse.json({
    voices: data ?? [],
    count: (data ?? []).length,
  });
}
