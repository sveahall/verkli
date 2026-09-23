import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { DEFAULT_AI_SETTINGS, type AiSettings, type AiSettingsInput } from "./contracts";

type Client = SupabaseClient<Database>;
type SettingsRow = Database["public"]["Tables"]["ai_memory_settings"]["Row"];

/**
 * No row means "never touched the settings page", which is the default account:
 * AI on, memory on, no personalisation. Returning defaults rather than throwing
 * keeps a first-time author out of an error state.
 *
 * A failed read is different and deliberately NOT silent-default: `aiEnabled`
 * defaults to true, so swallowing an outage would run AI for someone who turned
 * it off. The caller decides, which is why this rethrows.
 */
export async function getAiSettings(client: Client, ownerId: string): Promise<AiSettings> {
  const { data, error } = await client
    .from("ai_memory_settings")
    .select("ai_enabled,enabled,reply_style,warmth,enthusiasm,structure,emoji,match_writing_voice,nickname,craft,about,instructions")
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) {
    console.warn("[ai settings] read failed", { code: error.code ?? "unknown" });
    throw new AiSettingsError("AI_SETTINGS_UNAVAILABLE", 503, "Your AI settings could not be read, so nothing was sent to the assistant. Please try again.");
  }
  return data ? fromRow(data as SettingsRow) : DEFAULT_AI_SETTINGS;
}

export function fromRow(row: SettingsRow): AiSettings {
  return {
    aiEnabled: row.ai_enabled ?? DEFAULT_AI_SETTINGS.aiEnabled,
    memoryEnabled: row.enabled ?? DEFAULT_AI_SETTINGS.memoryEnabled,
    replyStyle: (row.reply_style as AiSettings["replyStyle"]) ?? DEFAULT_AI_SETTINGS.replyStyle,
    warmth: (row.warmth as AiSettings["warmth"]) ?? DEFAULT_AI_SETTINGS.warmth,
    enthusiasm: (row.enthusiasm as AiSettings["enthusiasm"]) ?? DEFAULT_AI_SETTINGS.enthusiasm,
    structure: (row.structure as AiSettings["structure"]) ?? DEFAULT_AI_SETTINGS.structure,
    emoji: (row.emoji as AiSettings["emoji"]) ?? DEFAULT_AI_SETTINGS.emoji,
    matchWritingVoice: row.match_writing_voice ?? DEFAULT_AI_SETTINGS.matchWritingVoice,
    nickname: row.nickname ?? "",
    craft: row.craft ?? "",
    about: row.about ?? "",
    instructions: row.instructions ?? "",
  };
}

export class AiSettingsError extends Error {
  constructor(readonly code: string, readonly status: number, message: string) {
    super(message);
    this.name = "AiSettingsError";
  }
}

/** Blank free text is stored as NULL so "not set" has one representation. */
const orNull = (value: string) => (value.trim() ? value : null);

export async function saveAiSettings(client: Client, ownerId: string, input: AiSettingsInput): Promise<void> {
  const { error } = await client.from("ai_memory_settings").upsert(
    {
      owner_id: ownerId,
      ai_enabled: input.aiEnabled,
      enabled: input.memoryEnabled,
      reply_style: input.replyStyle,
      warmth: input.warmth,
      enthusiasm: input.enthusiasm,
      structure: input.structure,
      emoji: input.emoji,
      match_writing_voice: input.matchWritingVoice,
      nickname: orNull(input.nickname),
      craft: orNull(input.craft),
      about: orNull(input.about),
      instructions: orNull(input.instructions),
    },
    { onConflict: "owner_id" }
  );
  if (error) {
    console.warn("[ai settings] write failed", { code: error.code ?? "unknown" });
    throw new AiSettingsError("AI_SETTINGS_SAVE_FAILED", 503, "Your AI settings could not be saved. Please try again.");
  }
}

/**
 * The master switch, enforced where it counts.
 *
 * Every route that spends money on a model calls this before doing anything
 * else. Hiding the buttons is not the control — an author who turned AI off and
 * still gets a reply from a saved bookmark or a stale tab has not been given
 * the setting they asked for.
 *
 * Returns the settings so the caller can reuse them for personalisation instead
 * of reading the row twice.
 */
export async function requireAiEnabled(client: Client, ownerId: string): Promise<AiSettings> {
  const settings = await getAiSettings(client, ownerId);
  if (!settings.aiEnabled) {
    throw new AiSettingsError(
      "AI_DISABLED",
      403,
      "AI is turned off for your account. Turn it back on under Settings → AI to use this feature."
    );
  }
  return settings;
}

export function aiSettingsErrorResponse(error: unknown) {
  const known =
    error instanceof AiSettingsError
      ? error
      : new AiSettingsError("AI_SETTINGS_UNAVAILABLE", 503, "Your AI settings could not be read. Please try again.");
  return Response.json({ error: known.code, message: known.message }, { status: known.status });
}
