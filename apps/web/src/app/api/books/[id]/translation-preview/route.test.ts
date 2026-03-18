import { beforeEach, describe, expect, it, vi } from "vitest"
import { AIProviderError } from "@/lib/ai/providers/types"

const mocks = vi.hoisted(() => ({
  requireAuthorRoleForApi: vi.fn(),
  createClient: vi.fn(),
  resolveTranslationSourceContext: vi.fn(),
  collectTranslationPreviewText: vi.fn(),
  getTranslator: vi.fn(),
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

vi.mock("@/lib/ai/providers/server", () => ({
  getTranslator: mocks.getTranslator,
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
                  id: "book-1",
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
    vi.clearAllMocks()
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
      params: Promise.resolve({ id: "book-1" }),
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
      sourceVersion: { id: "ver-1", book_id: "book-1", language_code: "sv" },
      sourceLanguage: "sv",
      sourceLanguageOrigin: "version",
    })
    mocks.collectTranslationPreviewText.mockResolvedValueOnce("Hej varlden")
    const translate = vi.fn().mockResolvedValue({ translatedText: "Hello world" })
    mocks.getTranslator.mockReturnValueOnce({ translate })

    const res = await GET(new Request("http://localhost/api/books/book-1/translation-preview?targetLanguage=en"), {
      params: Promise.resolve({ id: "book-1" }),
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
    mocks.requireAuthorRoleForApi.mockResolvedValueOnce({
      user: { id: "author-1" },
      response: null,
    })
    mocks.createClient.mockResolvedValueOnce(makeSupabaseMock("author-1"))
    mocks.resolveTranslationSourceContext.mockResolvedValueOnce({
      sourceVersionId: "ver-1",
      sourceVersion: { id: "ver-1", book_id: "book-1", language_code: "sv" },
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
    mocks.getTranslator.mockReturnValueOnce({ translate })

    const res = await GET(new Request("http://localhost/api/books/book-1/translation-preview?targetLanguage=en"), {
      params: Promise.resolve({ id: "book-1" }),
    })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({
      originalText: "Hej varlden",
      translatedText: "",
      previewText: "",
      previewUnavailable: true,
    })
  })

  it("returns pairUnsupported flag for unsupported translation pairs", async () => {
    mocks.requireAuthorRoleForApi.mockResolvedValueOnce({
      user: { id: "author-1" },
      response: null,
    })
    mocks.createClient.mockResolvedValueOnce(makeSupabaseMock("author-1"))
    mocks.resolveTranslationSourceContext.mockResolvedValueOnce({
      sourceVersionId: "ver-1",
      sourceVersion: { id: "ver-1", book_id: "book-1", language_code: "sv" },
      sourceLanguage: "sv",
      sourceLanguageOrigin: "version",
    })
    mocks.collectTranslationPreviewText.mockResolvedValueOnce("Hej varlden")

    const res = await GET(new Request("http://localhost/api/books/book-1/translation-preview?targetLanguage=de"), {
      params: Promise.resolve({ id: "book-1" }),
    })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.pairUnsupported).toBe(true)
    expect(body.originalText).toBe("Hej varlden")
    expect(mocks.getTranslator).not.toHaveBeenCalled()
  })
})
