import { AIProviderError } from "./types";
import type {
  CopywriterProvider,
  CopywriterGenerateOptions,
  CopywriterGenerateResult,
} from "./types";

const DEFAULT_MODEL = "llama3.1";
const DEFAULT_BASE_URL = "http://localhost:11434";
const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Ollama copywriter provider — calls a local Ollama instance for LLM generation.
 *
 * Configuration (environment variables):
 *   AI_OLLAMA_MODEL    — model name (default: llama3.1)
 *   OLLAMA_BASE_URL    — Ollama server URL (default: http://localhost:11434)
 *   AI_OLLAMA_TIMEOUT_MS — request timeout in ms (default: 60000)
 */
export class OllamaCopywriterProvider implements CopywriterProvider {
  readonly name = "ollama";

  private get model(): string {
    return process.env.AI_OLLAMA_MODEL ?? DEFAULT_MODEL;
  }

  private get baseUrl(): string {
    return process.env.OLLAMA_BASE_URL ?? DEFAULT_BASE_URL;
  }

  private get timeoutMs(): number {
    const env = process.env.AI_OLLAMA_TIMEOUT_MS;
    if (env) {
      const parsed = Number(env);
      if (!Number.isNaN(parsed) && parsed > 0) return parsed;
    }
    return DEFAULT_TIMEOUT_MS;
  }

  async generate(
    options: CopywriterGenerateOptions
  ): Promise<CopywriterGenerateResult> {
    const model = options.model ?? this.model;
    const url = `${this.baseUrl}/api/chat`;

    const body = {
      model,
      messages: [
        { role: "system", content: options.systemPrompt },
        { role: "user", content: options.userPrompt },
      ],
      format: "json",
      stream: false,
    };

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "TimeoutError") {
        throw new AIProviderError(
          `Ollama request timed out after ${this.timeoutMs}ms`,
          "TIMEOUT",
          this.name
        );
      }
      throw new AIProviderError(
        `Ollama request failed: ${err instanceof Error ? err.message : String(err)}`,
        "PROVIDER_UNAVAILABLE",
        this.name,
        err instanceof Error ? err : undefined
      );
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "unknown error");
      throw new AIProviderError(
        `Ollama returned ${response.status}: ${errorText}`,
        "MODEL_ERROR",
        this.name
      );
    }

    const data = (await response.json()) as {
      message?: { content?: string };
    };

    const text = data.message?.content ?? "";
    if (!text) {
      throw new AIProviderError(
        "Ollama returned an empty response",
        "MODEL_ERROR",
        this.name
      );
    }

    return { text };
  }

  getAvailableModels(): string[] {
    return [this.model];
  }
}

export const ollamaCopywriter = new OllamaCopywriterProvider();
