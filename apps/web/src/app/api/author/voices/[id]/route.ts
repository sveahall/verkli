import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAudit, auditMetadataFromRequest } from "@/lib/audit";
import { deleteVoice } from "@/lib/tts/elevenlabs-voice-cloning";
import {
  apiError,
  E_GENERIC_ERROR,
  E_VALIDATION_FAILED,
  E_BOOK_NOT_FOUND,
} from "@/lib/api-errors";

// DELETE /api/author/voices/[id] — GDPR right-to-erasure for a cloned voice.
//
// Flow:
//   1. Mark our row `status='deleting'`.
//   2. Call ElevenLabs DELETE /v1/voices/<voice_id>.
//   3. Soft-delete the local row (deleted_at = now()).
//   4. Audit log entry.
//
// If step 2 fails we leave the row in `status='deleting'` so a manual retry
// (or a sweeper job) can finish the upstream removal. We do NOT soft-delete
// locally before upstream succeeds — that would leak a dangling ElevenLabs
// voice with no record of who owned it.

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function DELETE(
  request: Request,
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
    .from("author_voices" as never)
    .select("id, user_id, elevenlabs_voice_id, name, status, deleted_at")
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
        elevenlabs_voice_id: string;
        name: string;
        status: string;
        deleted_at: string | null;
      }
    | null;
  if (!voice) return apiError(E_BOOK_NOT_FOUND, 404);
  if (voice.user_id !== auth.user.id) return apiError(E_BOOK_NOT_FOUND, 404);
  if (voice.deleted_at) {
    return NextResponse.json({ ok: true, alreadyDeleted: true });
  }

  // 2. Mark as deleting.
  const { error: markError } = await admin
    .from("author_voices" as never)
    .update({ status: "deleting" })
    .eq("id", id);
  if (markError) {
    console.error("[author.voices.delete] mark-deleting failed", {
      voiceId: id,
      message: markError.message,
    });
    return apiError(E_GENERIC_ERROR, 500);
  }

  // 3. Upstream delete.
  try {
    await deleteVoice(voice.elevenlabs_voice_id);
  } catch (err) {
    console.error("[author.voices.delete] upstream delete failed", {
      voiceId: id,
      elevenlabsVoiceId: voice.elevenlabs_voice_id,
      message: err instanceof Error ? err.message : String(err),
    });
    // Leave the row in `status='deleting'` for retry. Surface 502 so the
    // caller knows it didn't complete and can prompt a retry.
    return apiError(E_GENERIC_ERROR, 502);
  }

  // 4. Soft-delete locally + audit.
  const now = new Date().toISOString();
  await admin
    .from("author_voices" as never)
    .update({ deleted_at: now, status: "ready" })
    .eq("id", id);

  void recordAudit(admin, {
    action: "profile.deletion_requested", // reusing existing audit action; voice deletion is GDPR-aligned
    target: { type: "profile", id: auth.user.id },
    after: {
      kind: "voice_deletion",
      voice_id: id,
      elevenlabs_voice_id: voice.elevenlabs_voice_id,
      name: voice.name,
    },
    metadata: auditMetadataFromRequest(request),
  });

  return NextResponse.json({ ok: true, deletedAt: now });
}
