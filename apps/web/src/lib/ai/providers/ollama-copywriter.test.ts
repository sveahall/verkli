import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OllamaCopywriterProvider } from "./ollama-copywriter";
import { AIProviderError } from "./types";

describe("OllamaCopywriterProvider", () => {
  let provider: OllamaCopywriterProvider;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    provider = new OllamaCopywriterProvider();
    delete process.env.AI_OLLAMA_MODEL;
    delete process.env.OLLAMA_BASE_URL;
    delete process.env.AI_OLLAMA_TIMEOUT_MS;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("has name 'ollama'", () => {
    expect(provider.name).toBe("ollama");
  });

  it("sends correct request format to Ollama", async () => {
    const mockResponse = {
      message: { content: '{"headline":"Test"}' },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    await provider.generate({
      systemPrompt: "You are a copywriter.",
      userPrompt: "Write a headline.",
    });

    expect(globalThis.fetch).toHaveBeenCalledOnce();
    const [url, opts] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(url).toBe("http://localhost:11434/api/chat");
    expect(opts?.method).toBe("POST");

    const body = JSON.parse(opts?.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: "llama3.1",
      messages: [
        { role: "system", content: "You are a copywriter." },
        { role: "user", content: "Write a headline." },
      ],
      format: "json",
      stream: false,
    });
  });

  it("returns the LLM text content", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          message: { content: '{"headline":"AI Generated"}' },
        }),
    });

    const result = await provider.generate({
      systemPrompt: "system",
      userPrompt: "user",
    });

    expect(result.text).toBe('{"headline":"AI Generated"}');
  });

  it("uses custom model from options", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ message: { content: '{"ok":true}' } }),
    });

    await provider.generate({
      systemPrompt: "s",
      userPrompt: "u",
      model: "mistral",
    });

    const body = JSON.parse(
      vi.mocked(globalThis.fetch).mock.calls[0][1]?.body as string
    ) as Record<string, unknown>;
    expect(body.model).toBe("mistral");
  });

  it("uses env var for model", async () => {
    process.env.AI_OLLAMA_MODEL = "gemma2";

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ message: { content: '{"ok":true}' } }),
    });

    await provider.generate({ systemPrompt: "s", userPrompt: "u" });

    const body = JSON.parse(
      vi.mocked(globalThis.fetch).mock.calls[0][1]?.body as string
    ) as Record<string, unknown>;
    expect(body.model).toBe("gemma2");
  });

  it("uses env var for base URL", async () => {
    process.env.OLLAMA_BASE_URL = "http://remote:8080";

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ message: { content: '{"ok":true}' } }),
    });

    await provider.generate({ systemPrompt: "s", userPrompt: "u" });

    const [url] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(url).toBe("http://remote:8080/api/chat");
  });

  it("throws AIProviderError with TIMEOUT on timeout", async () => {
    const timeoutErr = new DOMException("The operation was aborted", "TimeoutError");
    globalThis.fetch = vi.fn().mockRejectedValue(timeoutErr);

    await expect(
      provider.generate({ systemPrompt: "s", userPrompt: "u" })
    ).rejects.toThrow(AIProviderError);

    await expect(
      provider.generate({ systemPrompt: "s", userPrompt: "u" })
    ).rejects.toMatchObject({ code: "TIMEOUT", provider: "ollama" });
  });

  it("throws AIProviderError with PROVIDER_UNAVAILABLE on network error", async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error("fetch failed"));

    await expect(
      provider.generate({ systemPrompt: "s", userPrompt: "u" })
    ).rejects.toThrow(AIProviderError);

    await expect(
      provider.generate({ systemPrompt: "s", userPrompt: "u" })
    ).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
      provider: "ollama",
    });
  });

  it("throws AIProviderError with MODEL_ERROR on non-ok response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("internal server error"),
    });

    await expect(
      provider.generate({ systemPrompt: "s", userPrompt: "u" })
    ).rejects.toThrow(AIProviderError);

    await expect(
      provider.generate({ systemPrompt: "s", userPrompt: "u" })
    ).rejects.toMatchObject({
      code: "MODEL_ERROR",
      provider: "ollama",
    });
  });

  it("throws AIProviderError with MODEL_ERROR on empty response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ message: { content: "" } }),
    });

    await expect(
      provider.generate({ systemPrompt: "s", userPrompt: "u" })
    ).rejects.toThrow(AIProviderError);

    await expect(
      provider.generate({ systemPrompt: "s", userPrompt: "u" })
    ).rejects.toMatchObject({
      code: "MODEL_ERROR",
      provider: "ollama",
    });
  });

  it("getAvailableModels returns configured model", () => {
    expect(provider.getAvailableModels()).toEqual(["llama3.1"]);

    process.env.AI_OLLAMA_MODEL = "codellama";
    expect(provider.getAvailableModels()).toEqual(["codellama"]);
  });
});
