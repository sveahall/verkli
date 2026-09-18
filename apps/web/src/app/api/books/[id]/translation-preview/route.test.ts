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
  enabled: vi.fn(), activation: vi.fn(), limit: vi.fn(), budget: vi.fn(), release: vi.fn(), validateCost: vi.fn(),
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

vi.mock("@/lib/flags", () => ({ isTranslationsEnabled: mocks.enabled }))
vi.mock("@/lib/translation-commit", () => ({ reviewedTranslationActivationReady: mocks.activation }))
vi.mock("@/lib/rate-limit", () => ({ createPerUserRateLimiter: () => ({ check: mocks.limit }) }))
vi.mock("@/lib/workers/budget", async (original) => ({
  ...await original<object>(), checkBudget: mocks.budget, releaseBudget: mocks.release, validateJobCost: mocks.validateCost,
}))

const { BudgetExceededError } = await import("@/lib/workers/budget")
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
    vi.clearAllMocks()
    mocks.enabled.mockReturnValue(true)
    mocks.activation.mockReturnValue(true)
    mocks.limit.mockResolvedValue({ allowed: true })
    mocks.budget.mockResolvedValue(undefined)
    mocks.validateCost.mockReturnValue(undefined)
    mocks.createClient.mockResolvedValue(makeSupabaseMock("author-1"))
    mocks.resolveTranslationSourceContext.mockResolvedValue({ sourceVersionId: "ver-1", sourceLanguage: "sv" })
    mocks.collectTranslationPreviewText.mockResolvedValue("Hej varlden")
    mocks.getTranslatorForPair.mockReturnValue({ translate: vi.fn().mockResolvedValue({ translatedText: "Hello" }) })
    mocks.isTranslationPairSupported.mockReturnValue(true)
    mocks.getProviderForPair.mockReturnValue("anthropic")
  })

  it.each(["feature", "rollout"])("does not spend while %s is held", async (held) => {
    (held === "feature" ? mocks.enabled : mocks.activation).mockReturnValue(false)
    mocks.requireAuthorRoleForApi.mockResolvedValueOnce({ user: { id: "author-1" }, response: null })
    const response = await GET(new Request("http://localhost/api/books/book-1/translation-preview?targetLanguage=en"), {
      params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000001" }),
    })
    expect(response.status).toBe(503)
    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(mocks.getTranslatorForPair).not.toHaveBeenCalled()
    expect(mocks.budget).not.toHaveBeenCalled()
  })

  it("does not call a provider above the named preview rate limit", async () => {
    mocks.requireAuthorRoleForApi.mockResolvedValueOnce({ user: { id: "author-1" }, response: null })
    mocks.limit.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 30 })
    const response = await GET(new Request("http://localhost/api/books/book-1/translation-preview?targetLanguage=en"), {
      params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000001" }),
    })
    expect(response.status).toBe(429)
    expect(response.headers.get("Retry-After")).toBe("30")
    expect(mocks.getTranslatorForPair).not.toHaveBeenCalled()
    expect(mocks.budget).not.toHaveBeenCalled()
  })

  it("does not call a provider above the translation daily allowance", async () => {
    mocks.requireAuthorRoleForApi.mockResolvedValueOnce({ user: { id: "author-1" }, response: null })
    mocks.createClient.mockResolvedValueOnce(makeSupabaseMock("author-1"))
    mocks.resolveTranslationSourceContext.mockResolvedValueOnce({ sourceVersionId: "ver-1", sourceLanguage: "sv" })
    mocks.collectTranslationPreviewText.mockResolvedValueOnce("Hej varlden")
    const translate = vi.fn().mockResolvedValue({ translatedText: "Hello" })
    mocks.getTranslatorForPair.mockReturnValueOnce({ translate })
    mocks.budget.mockRejectedValueOnce(new BudgetExceededError({ userId: "author-1", pipeline: "translation", day: "2026-09-18", key: "test", current: 500000, limit: 500000, jobId: "test" }))
    const response = await GET(new Request("http://localhost/api/books/book-1/translation-preview?targetLanguage=en"), {
      params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000001" }),
    })
    expect(response.status).toBe(429)
    expect(translate).not.toHaveBeenCalled()
    expect(mocks.release).not.toHaveBeenCalled()
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
    expect(mocks.budget).toHaveBeenCalledWith(expect.objectContaining({
      userId: "author-1", pipeline: "translation", jobId: expect.stringMatching(/^translation-preview:/),
      units: expect.any(Number),
    }))
    expect(mocks.budget.mock.invocationCallOrder[0]).toBeLessThan(translate.mock.invocationCallOrder[0])
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

    expect(res.status).toBe(200)
    expect(mocks.release).not.toHaveBeenCalled()
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
