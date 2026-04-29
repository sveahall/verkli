// Voice library v0 (Phase 1.1).
//
// Server component that lists the author's cloned voices. Recorder UI is
// deferred to a focused session (browser MediaRecorder cross-browser
// coverage is non-trivial). For now this page lets authors:
//   - see voices they've cloned (read-only list)
//   - delete a voice (GDPR erasure)
//
// Once the recorder ships, it slots into the empty-state CTA.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import VoiceList, { type VoiceRow } from "./VoiceList";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AuthorVoicesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/author/signin");

  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("author_voices" as never)
    .select(
      "id, elevenlabs_voice_id, name, description, source, is_default, status, created_at"
    )
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  const voices = ((rows ?? []) as VoiceRow[]) ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-10">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Voice library</h1>
        <p className="text-sm text-muted-foreground">
          Voices you have cloned in ElevenLabs. Deleting a voice removes it
          from ElevenLabs as well (GDPR right-to-erasure).
        </p>
      </header>

      {voices.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <h2 className="text-lg font-semibold tracking-tight">No voices yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Voice cloning recorder ships in the next iteration. For now, you
            can clone voices via the ElevenLabs dashboard and they will appear
            here once registered through the Verkli API.
          </p>
        </div>
      ) : (
        <VoiceList initialVoices={voices} />
      )}
    </div>
  );
}
