import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  apiError,
  E_GENERIC_ERROR,
  E_VALIDATION_FAILED,
  E_BOOK_NOT_FOUND,
} from "@/lib/api-errors";

// Library rows historically allowed client writes to elevenlabs_voice_id.
// Owning a row (even one with consent) does not prove ownership of that external
// resource. Deletion must remain blocked until server-verified provenance and
// reconciliation of existing rows are available; changing ACLs alone is not enough.

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuthorRoleForApi();
  if (!auth.user) return auth.response;

  const params = await context.params;
  const parsed = paramsSchema.safeParse(params);
  if (!parsed.success) return apiError(E_VALIDATION_FAILED, 400);

  const admin = createAdminClient();
  const { id } = parsed.data;

  // 1. Load + ownership check.
  const { data: row, error: loadError } = await admin
    .from("author_voices")
    .select("id, user_id, deleted_at")
    .eq("id", id)
    .maybeSingle();

  if (loadError) {
    console.error("[author.voices.delete] load failed", {
      voiceId: id,
      message: loadError.message,
    });
    return apiError(E_GENERIC_ERROR, 500);
  }
  const voice = row as
    | {
        id: string;
        user_id: string;
        deleted_at: string | null;
      }
    | null;
  if (!voice) return apiError(E_BOOK_NOT_FOUND, 404);
  if (voice.user_id !== auth.user.id) return apiError(E_BOOK_NOT_FOUND, 404);
  if (voice.deleted_at) {
    return NextResponse.json({ ok: true, alreadyDeleted: true });
  }

  console.warn("[author.voices.delete] provider ownership requires verification", {
    voiceId: id,
  });
  return NextResponse.json(
    {
      error: "VOICE_DELETION_REQUIRES_VERIFICATION",
      message: "External voice ownership must be verified manually before deletion. No changes were made.",
    },
    { status: 409 },
  );
}
