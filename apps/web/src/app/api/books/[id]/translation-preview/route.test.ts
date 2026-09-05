import { beforeEach, describe, expect, it, vi } from "vitest"
import { AIProviderError } from "@/lib/ai/providers/types"

const mocks = vi.hoisted(() => ({
  requireAuthorRoleForApi: vi.fn(),
  createClient: vi.fn(),
  resolveTranslationSourceContext: vi.fn(),
  collectTranslationPreviewText: vi.fn(),
  getTranslatorForPair: vi.fn(),
  isTranslationPairSupported: vi.fn(),
  getProviderForPair: vi.fn(),
}))

vi.mock("@/lib/auth/require-author", () => ({
  requireAuthorRoleForApi: mocks.requireAuthorRoleForApi,
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}))

vi.mock("@/lib/book-translation", () => ({
  resolveTranslationSourceContext: mocks.resolveTranslationSourceContext,
  collectTranslationPreviewText: mocks.collectTranslationPreviewText,
}))

// Mocked so the unsupported-pair branch is testable on its own terms. Every
// language the app offers now has a provider, so no real pair reaches it.
vi.mock("@/lib/translation-pairs", () => ({
  isTranslationPairSupported: mocks.isTranslationPairSupported,
  getProviderForPair: mocks.getProviderForPair,
}))

vi.mock("@/lib/ai/providers/server", () => ({
  getTranslatorForPair: mocks.getTranslatorForPair,
}))

const { GET } = await import("./route")

function makeSupabaseMock(bookAuthorId: string) {
  return {
    from(table: string) {
      if (table === "books") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: "00000000-0000-4000-8000-000000000001",
                  author_id: bookAuthorId,
                  original_language: "sv",
                  language: "sv",
                },
                error: null,
              }),
            }),
          }),
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    },
  }
}

describe("GET /api/books/[id]/translation-preview", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.isTranslationPairSupported.mockReturnValue(true)
    mocks.getProviderForPair.mockReturnValue("anthropic")
  })

  it("forwards auth failure response", async () => {
    mocks.requireAuthorRoleForApi.mockResolvedValueOnce({
      user: null,
      response: new Response(JSON.stringify({ error: "NOT_AUTHENTICATED" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    })

    const res = await GET(new Request("http://localhost/api/books/book-1/translation-preview?targetLanguage=en"), {
      params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000001" }),
    })

    expect(res.status).toBe(401)
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it("returns original and translated preview text", async () => {
    mocks.requireAuthorRoleForApi.mockResolvedValueOnce({
      user: { id: "author-1" },
      response: null,
    })
    mocks.createClient.mockResolvedValueOnce(makeSupabaseMock("author-1"))
    mocks.resolveTranslationSourceContext.mockResolvedValueOnce({
      sourceVersionId: "ver-1",
      sourceVersion: { id: "ver-1", book_id: "00000000-0000-4000-8000-000000000001", language_code: "sv" },
      sourceLanguage: "sv",
      sourceLanguageOrigin: "version",
    })
    mocks.collectTranslationPreviewText.mockResolvedValueOnce("Hej varlden")
    const translate = vi.fn().mockResolvedValue({ translatedText: "Hello world" })
    mocks.getTranslatorForPair.mockReturnValueOnce({ translate })

    const res = await GET(new Request("http://localhost/api/books/book-1/translation-preview?targetLanguage=en"), {
      params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000001" }),
    })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({
      originalText: "Hej varlden",
      translatedText: "Hello world",
      previewText: "Hello world",
    })
    expect(translate).toHaveBeenCalledWith({
      text: "Hej varlden",
      sourceLanguage: "sv",
      targetLanguage: "en",
    })
  })

  it("returns degraded preview when local provider setup is unavailable", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined)
    mocks.requireAuthorRoleForApi.mockResolvedValueOnce({
      user: { id: "author-1" },
      response: null,
    })
    mocks.createClient.mockResolvedValueOnce(makeSupabaseMock("author-1"))
    mocks.resolveTranslationSourceContext.mockResolvedValueOnce({
      sourceVersionId: "ver-1",
      sourceVersion: { id: "ver-1", book_id: "00000000-0000-4000-8000-000000000001", language_code: "sv" },
      sourceLanguage: "sv",
      sourceLanguageOrigin: "version",
    })
    mocks.collectTranslationPreviewText.mockResolvedValueOnce("Hej varlden")
    const translate = vi
      .fn()
      .mockRejectedValue(
        new AIProviderError(
          "Required model file missing or not a file",
          "PROVIDER_UNAVAILABLE",
          "opus-mt"
        )
      )
    mocks.getTranslatorForPair.mockReturnValueOnce({ translate })

    const res = await GET(new Request("http://localhost/api/books/book-1/translation-preview?targetLanguage=en"), {
      params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000001" }),
    })
    const body = await res.json()

    expect(res.status).toBe(503)
    expect(body).toEqual({
      error: "TRANSLATION_SERVICE_UNAVAILABLE",
      originalText: "Hej varlden",
      translatedText: "",
      previewText: "",
      previewUnavailable: true,
    })
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("Required model file missing")
    errorLog.mockRestore()
  })

  it("returns the consistent service error without logging source text when preview collection fails", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined)
    mocks.requireAuthorRoleForApi.mockResolvedValueOnce({ user: { id: "author-1" }, response: null })
    mocks.createClient.mockResolvedValueOnce(makeSupabaseMock("author-1"))
    mocks.resolveTranslationSourceContext.mockResolvedValueOnce({
      sourceVersionId: "ver-1",
      sourceVersion: { id: "ver-1", book_id: "00000000-0000-4000-8000-000000000001", language_code: "sv" },
      sourceLanguage: "sv",
      sourceLanguageOrigin: "version",
    })
    mocks.collectTranslationPreviewText.mockRejectedValueOnce(new Error("PRIVATE MANUSCRIPT SENTENCE"))

    const res = await GET(new Request("http://localhost/api/books/book-1/translation-preview?targetLanguage=en"), {
      params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000001" }),
    })

    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toEqual({
      error: "TRANSLATION_SERVICE_UNAVAILABLE",
      originalText: "",
      translatedText: "",
      previewText: "",
      previewUnavailable: true,
    })
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("PRIVATE MANUSCRIPT SENTENCE")
    errorLog.mockRestore()
  })

  it("passes the requested source version to the resolver", async () => {
    mocks.requireAuthorRoleForApi.mockResolvedValueOnce({
      user: { id: "author-1" },
      response: null,
    })
    const supabase = makeSupabaseMock("author-1")
    mocks.createClient.mockResolvedValueOnce(supabase)
    mocks.resolveTranslationSourceContext.mockResolvedValueOnce({
      sourceVersionId: "00000000-0000-4000-8000-000000000011",
      sourceVersion: { id: "00000000-0000-4000-8000-000000000011", book_id: "00000000-0000-4000-8000-000000000001", language_code: "en" },
      sourceLanguage: "en",
      sourceLanguageOrigin: "version",
    })
    mocks.collectTranslationPreviewText.mockResolvedValueOnce("Hello world")
    mocks.getTranslatorForPair.mockReturnValueOnce({
      translate: vi.fn().mockResolvedValue({ translatedText: "Hej världen" }),
    })

    await GET(new Request("http://localhost/api/books/book-1/translation-preview?targetLanguage=sv&sourceVersionId=00000000-0000-4000-8000-000000000011"), {
      params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000001" }),
    })

    expect(mocks.resolveTranslationSourceContext).toHaveBeenCalledWith({
      supabase,
      bookId: "00000000-0000-4000-8000-000000000001",
      book: expect.objectContaining({ author_id: "author-1" }),
      requestedSourceVersionId: "00000000-0000-4000-8000-000000000011",
    })
  })

  it.each(["", "%20%20", "not-a-uuid"])(
    "rejects an explicitly invalid source version '%s' before source or provider access",
    async (sourceVersionId) => {
      mocks.requireAuthorRoleForApi.mockResolvedValueOnce({ user: { id: "author-1" }, response: null })
      mocks.createClient.mockResolvedValueOnce(makeSupabaseMock("author-1"))
      mocks.resolveTranslationSourceContext.mockResolvedValueOnce({
        sourceVersionId: "ver-default",
        sourceVersion: { id: "ver-default", book_id: "00000000-0000-4000-8000-000000000001", language_code: "sv" },
        sourceLanguage: "sv",
        sourceLanguageOrigin: "version",
      })
      mocks.collectTranslationPreviewText.mockResolvedValueOnce("")

      const res = await GET(new Request(`http://localhost/api/books/book-1/translation-preview?targetLanguage=en&sourceVersionId=${sourceVersionId}`), {
        params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000001" }),
      })

      expect(res.status).toBe(400)
      await expect(res.json()).resolves.toMatchObject({ error: "INVALID_SOURCE_VERSION" })
      expect(mocks.resolveTranslationSourceContext).not.toHaveBeenCalled()
      expect(mocks.collectTranslationPreviewText).not.toHaveBeenCalled()
      expect(mocks.getTranslatorForPair).not.toHaveBeenCalled()
    },
  )

  it("rejects an unresolved requested version before source or provider access", async () => {
    mocks.requireAuthorRoleForApi.mockResolvedValueOnce({
      user: { id: "author-1" },
      response: null,
    })
    mocks.createClient.mockResolvedValueOnce(makeSupabaseMock("author-1"))
    mocks.resolveTranslationSourceContext.mockResolvedValueOnce({
      sourceVersionId: "00000000-0000-4000-8000-000000000099",
      sourceVersion: null,
      sourceLanguage: null,
      sourceLanguageOrigin: null,
    })

    const res = await GET(new Request("http://localhost/api/books/book-1/translation-preview?targetLanguage=en&sourceVersionId=00000000-0000-4000-8000-000000000099"), {
      params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000001" }),
    })

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: "INVALID_SOURCE_VERSION" })
    expect(mocks.collectTranslationPreviewText).not.toHaveBeenCalled()
    expect(mocks.getTranslatorForPair).not.toHaveBeenCalled()
  })

  it("returns empty success without a provider call for whitespace-only source", async () => {
    mocks.requireAuthorRoleForApi.mockResolvedValueOnce({ user: { id: "author-1" }, response: null })
    mocks.createClient.mockResolvedValueOnce(makeSupabaseMock("author-1"))
    mocks.resolveTranslationSourceContext.mockResolvedValueOnce({
      sourceVersionId: "ver-1",
      sourceVersion: { id: "ver-1", book_id: "00000000-0000-4000-8000-000000000001", language_code: "sv" },
      sourceLanguage: "sv",
      sourceLanguageOrigin: "version",
    })
    mocks.collectTranslationPreviewText.mockResolvedValueOnce("   \n")

    const res = await GET(new Request("http://localhost/api/books/book-1/translation-preview?targetLanguage=en"), {
      params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000001" }),
    })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ originalText: "", translatedText: "", previewText: "" })
    expect(mocks.getTranslatorForPair).not.toHaveBeenCalled()
  })

  it("returns a service error with the original when the registry is missing a supported provider", async () => {
    mocks.requireAuthorRoleForApi.mockResolvedValueOnce({ user: { id: "author-1" }, response: null })
    mocks.createClient.mockResolvedValueOnce(makeSupabaseMock("author-1"))
    mocks.resolveTranslationSourceContext.mockResolvedValueOnce({
      sourceVersionId: "ver-1",
      sourceVersion: { id: "ver-1", book_id: "00000000-0000-4000-8000-000000000001", language_code: "sv" },
      sourceLanguage: "sv",
      sourceLanguageOrigin: "version",
    })
    mocks.collectTranslationPreviewText.mockResolvedValueOnce("Hej varlden")
    mocks.getTranslatorForPair.mockReturnValueOnce(null)

    const res = await GET(new Request("http://localhost/api/books/book-1/translation-preview?targetLanguage=en"), {
      params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000001" }),
    })

    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toEqual({
      error: "TRANSLATION_SERVICE_UNAVAILABLE",
      originalText: "Hej varlden",
      translatedText: "",
      previewText: "",
      previewUnavailable: true,
    })
  })

  it.each([
    ["null", null],
    ["wrong type", { translatedText: 42 }],
    ["blank", { translatedText: "   " }],
  ])("rejects %s provider output and preserves the original", async (_name, result) => {
    mocks.requireAuthorRoleForApi.mockResolvedValueOnce({ user: { id: "author-1" }, response: null })
    mocks.createClient.mockResolvedValueOnce(makeSupabaseMock("author-1"))
    mocks.resolveTranslationSourceContext.mockResolvedValueOnce({
      sourceVersionId: "ver-1",
      sourceVersion: { id: "ver-1", book_id: "00000000-0000-4000-8000-000000000001", language_code: "sv" },
      sourceLanguage: "sv",
      sourceLanguageOrigin: "version",
    })
    mocks.collectTranslationPreviewText.mockResolvedValueOnce("Hej varlden")
    mocks.getTranslatorForPair.mockReturnValueOnce({ translate: vi.fn().mockResolvedValue(result) })

    const res = await GET(new Request("http://localhost/api/books/book-1/translation-preview?targetLanguage=en"), {
      params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000001" }),
    })

    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toMatchObject({
      error: "TRANSLATION_SERVICE_UNAVAILABLE",
      originalText: "Hej varlden",
      previewUnavailable: true,
    })
  })

  it("does not resolve source or reach the provider for another author's book", async () => {
    mocks.requireAuthorRoleForApi.mockResolvedValueOnce({ user: { id: "author-1" }, response: null })
    mocks.createClient.mockResolvedValueOnce(makeSupabaseMock("author-2"))

    const res = await GET(new Request("http://localhost/api/books/book-1/translation-preview?targetLanguage=en"), {
      params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000001" }),
    })

    expect(res.status).toBe(403)
    expect(mocks.resolveTranslationSourceContext).not.toHaveBeenCalled()
    expect(mocks.getTranslatorForPair).not.toHaveBeenCalled()
  })

  it("returns pairUnsupported flag for unsupported translation pairs", async () => {
    mocks.requireAuthorRoleForApi.mockResolvedValueOnce({
      user: { id: "author-1" },
      response: null,
    })
    mocks.createClient.mockResolvedValueOnce(makeSupabaseMock("author-1"))
    mocks.resolveTranslationSourceContext.mockResolvedValueOnce({
      sourceVersionId: "ver-1",
      sourceVersion: { id: "ver-1", book_id: "00000000-0000-4000-8000-000000000001", language_code: "sv" },
      sourceLanguage: "sv",
      sourceLanguageOrigin: "version",
    })
    mocks.collectTranslationPreviewText.mockResolvedValueOnce("Hej varlden")

    mocks.isTranslationPairSupported.mockReturnValue(false)
    mocks.getProviderForPair.mockReturnValue(null)

    const res = await GET(new Request("http://localhost/api/books/book-1/translation-preview?targetLanguage=it"), {
      params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000001" }),
    })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.pairUnsupported).toBe(true)
    expect(body.originalText).toBe("Hej varlden")
    expect(mocks.getTranslatorForPair).not.toHaveBeenCalled()
  })
})
