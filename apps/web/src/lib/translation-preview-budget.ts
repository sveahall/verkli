import { ANTHROPIC_TRANSLATOR_MAX_RETRIES, ANTHROPIC_TRANSLATOR_MAX_TOKENS } from "./ai/providers/anthropic-translator";
import { RIVA_TRANSLATOR_MAX_TOKENS } from "./ai/providers/nvidia-riva-translator";
import type { TranslationProvider } from "./translation-pairs";

export const PREVIEW_MAX_INTERMEDIATE_BYTES = 8_000;
// Covers the fixed system prompt, model/language names, JSON array and message
// framing. Tests compare this reservation with the actual provider requests.
const REQUEST_FRAMING_UNITS = 4_096;

/** Conservative model token units, not a monetary invoice. No spent/unknown refund. */
export function estimateTranslationPreviewCost(text: string, provider: TranslationProvider | null): number {
  // Anthropic embeds a JSON segment array inside its message JSON. Count both
  // escaping layers; this also conservatively covers the plain-text providers.
  const input = new TextEncoder().encode(JSON.stringify(JSON.stringify([text]))).length;
  if (provider === "anthropic") {
    return (input + REQUEST_FRAMING_UNITS + ANTHROPIC_TRANSLATOR_MAX_TOKENS) * (1 + ANTHROPIC_TRANSLATOR_MAX_RETRIES);
  }
  if (provider === "nvidia-riva") return input + REQUEST_FRAMING_UNITS + RIVA_TRANSLATOR_MAX_TOKENS;
  if (provider === "chain") {
    // Registry chains are Opus/Riva in either order. Reserve both legs anyway;
    // the second input is bounded by ChainTranslator before its provider call.
    // A control byte can expand to six JSON bytes (e.g. escaped U+0000).
    return input + 6 * PREVIEW_MAX_INTERMEDIATE_BYTES + 2 * (REQUEST_FRAMING_UNITS + RIVA_TRANSLATOR_MAX_TOKENS);
  }
  if (provider === "opus") return 0;
  throw new Error("The preview provider has no bounded request allowance.");
}
