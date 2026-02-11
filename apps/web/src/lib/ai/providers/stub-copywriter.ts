import type {
  CopywriterProvider,
  CopywriterGenerateOptions,
  CopywriterGenerateResult,
} from "./types";

/**
 * Stub copywriter provider — returns safe template text using data from the prompt.
 * Extracts the book title from the user prompt and builds template-safe JSON.
 * Never calls an external LLM. Always sets metadata.stub = true in the orchestrator.
 */
export class StubCopywriterProvider implements CopywriterProvider {
  readonly name = "stub-copywriter";

  async generate(
    options: CopywriterGenerateOptions
  ): Promise<CopywriterGenerateResult> {
    // Extract book title from the user prompt (format: "Bok: <title>")
    const titleMatch = options.userPrompt.match(/Bok:\s*(.+?)(?:\n|$)/);
    const bookTitle = titleMatch?.[1]?.trim() ?? "Din bok";

    const result = {
      headline: bookTitle,
      body: `Upptäck ${bookTitle} — en unik läsupplevelse på Verkli.`,
      cta: "Läs på Verkli",
      hashtags: "#verkli #böcker",
    };

    return { text: JSON.stringify(result) };
  }

  getAvailableModels(): string[] {
    return ["stub"];
  }
}

export const stubCopywriter = new StubCopywriterProvider();
