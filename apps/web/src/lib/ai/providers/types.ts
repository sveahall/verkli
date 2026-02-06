/**
 * AI Provider Interfaces
 *
 * Defines contracts for AI capabilities. Implementations can be swapped
 * via environment variables without changing consumer code.
 */

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
