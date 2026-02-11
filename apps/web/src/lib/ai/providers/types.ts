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
  getSupportedPairs(): string[];
}

// ─────────────────────────────────────────────────────────────
// Narrator Provider (Text-to-Speech)
// ─────────────────────────────────────────────────────────────

export interface NarrateOptions {
  text: string;
  voiceId?: string;
  language?: string;
}

export interface NarrateResult {
  audioBuffer: Buffer;
  durationSeconds?: number;
}

export interface NarratorProvider {
  readonly name: string;
  narrate(options: NarrateOptions): Promise<NarrateResult>;
  getAvailableVoices(): string[];
}

// ─────────────────────────────────────────────────────────────
// Video Provider (Text-to-Video)
// ─────────────────────────────────────────────────────────────

export interface VideoGenerateOptions {
  promptText: string;
  duration?: number;
  aspectRatio?: string;
  audio?: boolean;
}

export interface VideoGenerateResult {
  videoUrl?: string;
  output?: unknown;
}

export interface VideoProvider {
  readonly name: string;
  generate(options: VideoGenerateOptions): Promise<VideoGenerateResult>;
}

// ─────────────────────────────────────────────────────────────
// Image Provider
// ─────────────────────────────────────────────────────────────

export interface ImageGenerateOptions {
  prompt: string;
  width?: number;
  height?: number;
  style?: string;
}

export interface ImageGenerateResult {
  imageUrl: string | null;
  width: number;
  height: number;
}

export interface ImageProvider {
  readonly name: string;
  generate(options: ImageGenerateOptions): Promise<ImageGenerateResult>;
  getSupportedStyles(): string[];
}

// ─────────────────────────────────────────────────────────────
// Copywriter Provider (LLM)
// ─────────────────────────────────────────────────────────────

export interface CopywriterGenerateOptions {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
}

export interface CopywriterGenerateResult {
  text: string;
}

export interface CopywriterProvider {
  readonly name: string;
  generate(options: CopywriterGenerateOptions): Promise<CopywriterGenerateResult>;
  getAvailableModels(): string[];
}
