/**
 * AI Provider Interfaces
 *
 * Defines contracts for AI capabilities. Implementations can be swapped
 * via environment variables without changing consumer code.
 */

// ─────────────────────────────────────────────────────────────
// Common Error Type
// ─────────────────────────────────────────────────────────────

export type AIProviderErrorCode =
  | "PROVIDER_UNAVAILABLE"
  | "INVALID_INPUT"
  | "TIMEOUT"
  | "RATE_LIMITED"
  | "MODEL_ERROR"
  | "UNKNOWN";

export class AIProviderError extends Error {
  readonly code: AIProviderErrorCode;
  readonly provider: string;
  readonly cause?: Error;

  constructor(
    message: string,
    code: AIProviderErrorCode,
    provider: string,
    cause?: Error
  ) {
    super(message);
    this.name = "AIProviderError";
    this.code = code;
    this.provider = provider;
    this.cause = cause;
  }

  static fromError(err: unknown, provider: string): AIProviderError {
    if (err instanceof AIProviderError) {
      return err;
    }
    const message = err instanceof Error ? err.message : String(err);
    const cause = err instanceof Error ? err : undefined;

    // Map common error patterns to codes
    let code: AIProviderErrorCode = "UNKNOWN";
    const lowerMsg = message.toLowerCase();
    if (lowerMsg.includes("timeout") || lowerMsg.includes("timed out")) {
      code = "TIMEOUT";
    } else if (lowerMsg.includes("not set") || lowerMsg.includes("missing") || lowerMsg.includes("not found")) {
      code = "PROVIDER_UNAVAILABLE";
    } else if (lowerMsg.includes("invalid") || lowerMsg.includes("empty")) {
      code = "INVALID_INPUT";
    } else if (lowerMsg.includes("rate") || lowerMsg.includes("limit")) {
      code = "RATE_LIMITED";
    }

    return new AIProviderError(message, code, provider, cause);
  }
}

// ─────────────────────────────────────────────────────────────
// Translator Provider
// ─────────────────────────────────────────────────────────────

export interface TranslateOptions {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
}

export interface TranslateResult {
  translatedText: string;
}

export interface TranslatorProvider {
  readonly name: string;
  translate(options: TranslateOptions): Promise<TranslateResult>;
  translateBatch?(texts: string[], sourceLanguage: string, targetLanguage: string): Promise<string[]>;
  getSupportedPairs(): string[];
}
