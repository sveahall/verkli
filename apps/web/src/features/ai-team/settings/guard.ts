import { createClient } from "@/lib/supabase/server";
import { apiError, E_AI_DISABLED, E_AI_SETTINGS_UNAVAILABLE } from "@/lib/api-errors";
import { AiSettingsError, requireAiEnabled } from "./server";

/**
 * One-line master-switch guard for AI routes.
 *
 * Returns a response to send, or null to continue. Self-contained on purpose:
 * every AI route can drop the same two lines directly under its auth gate
 * without reordering its own client setup, which is what makes it possible to
 * audit that no AI route is missing it.
 *
 *   const off = await aiDisabledResponse(user.id);
 *   if (off) return off;
 *
 * A read failure blocks too. `ai_enabled` defaults to true, so treating an
 * outage as "carry on" would run AI for exactly the accounts that turned it off.
 */
export async function aiDisabledResponse(userId: string): Promise<Response | null> {
  try {
    const supabase = await createClient();
    await requireAiEnabled(supabase, userId);
    return null;
  } catch (error) {
    if (error instanceof AiSettingsError && error.code === "AI_DISABLED") {
      return apiError(E_AI_DISABLED, 403, { detail: error.message });
    }
    console.warn("[ai settings] guard could not resolve settings", {
      code: error instanceof AiSettingsError ? error.code : "unexpected",
    });
    return apiError(E_AI_SETTINGS_UNAVAILABLE, 503);
  }
}
