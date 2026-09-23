import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  E_TRANSLATION_PAIR_UNSUPPORTED,
} from "@/lib/api-errors"

const mocks = vi.hoisted(() => ({
  requireAuthorRoleForApi: vi.fn(),
  requireProBillingForApi: vi.fn(),
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  getStripeCheckoutSession: vi.fn(),
  enqueueTranslationJob: vi.fn(),
  isTranslationsEnabled: vi.fn(),
  activation: vi.fn(),
  resolveTranslationSourceContext: vi.fn(),
  upsertBookTranslationState: vi.fn(),
  deleteBookTranslationState: vi.fn(),
  isTranslationPairSupported: vi.fn(),
}))

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock("@/lib/payments/stripe", () => ({ getStripeCheckoutSession: mocks.getStripeCheckoutSession }))
// Keep the real claim/release helpers: these tests verify the redemption row.

vi.mock("@/lib/translation-commit", () => ({ reviewedTranslationActivationReady: mocks.activation }))

// Mocked so the rejection branch is testable on its own terms. Every language
// the app offers now has a provider, so no real pair reaches it.
vi.mock("@/lib/translation-pairs", () => ({
  isTranslationPairSupported: mocks.isTranslationPairSupported,
}))

vi.mock("@/lib/auth/require-author", () => ({
  requireAuthorRoleForApi: mocks.requireAuthorRoleForApi,
}))

vi.mock("@/lib/billing/server", () => ({
  requireProBillingForApi: mocks.requireProBillingForApi,
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}))

vi.mock("@/lib/translation-queue", () => ({
  enqueueTranslationJob: mocks.enqueueTranslationJob,
}))

vi.mock("@/lib/flags", () => ({
  isTranslationsEnabled: mocks.isTranslationsEnabled,
  // Demo guard reads this; off by default in tests so the guard is a no-op.
  isDemoFacadeEnabled: () => false,
}))

vi.mock("@/lib/book-translation", () => ({
  resolveTranslationSourceContext: mocks.resolveTranslationSourceContext,
  upsertBookTranslationState: mocks.upsertBookTranslationState,
  deleteBookTranslationState: mocks.deleteBookTranslationState,
}))

// Rate limiting is covered separately; isolate these route regressions.
vi.mock("@/lib/rate-limit", () => ({
  createPerUserRateLimiter: () => ({ check: async () => ({ allowed: true }) }),
}))

// Force in-memory rate limiter (no Redis)
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return { ...actual, getRedisUrl: () => null, getRedisConnectionOptions: () => undefined, getRedisClientOptions: () => undefined };
})
// This route now checks the account's master AI switch first. Its own guard
// test covers the blocked path; here the account simply has AI on.
vi.mock("@/features/ai-team/settings/guard", () => ({ aiDisabledResponse: async () => null }));

const { POST } = await import("./route")

function makeBookVersionsQuery(existingVersion: { id: string; status: string } | null = null) {
  const builder = {
    select: () => builder,
    eq: vi.fn(() => builder),
    maybeSingle: async () => ({
      data: existingVersion,
      error: null,
    }),
  }
  return builder
}

function makeSupabaseMock() {
  const versionsQuery = makeBookVersionsQuery()
  return {
    from(table: string) {
      if (table === "books") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: "00000000-0000-4000-8000-000000000001",
                  author_id: "author-1",
                  original_language: "sv",
                  language: "sv",
                },
                error: null,
              }),
            }),
          }),
        }
      }

      if (table === "book_versions") {
        return versionsQuery
      }

      if (table === "chapters") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: "chapter-1" },
                  error: null,
                }),
              }),
            }),
          }),
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    },
  }
}

describe("POST /api/books/[id]/translate", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isTranslationsEnabled.mockReturnValue(true)
    mocks.activation.mockReturnValue(true)
    mocks.isTranslationPairSupported.mockReturnValue(true)
    mocks.requireAuthorRoleForApi.mockResolvedValue({
      user: { id: "author-1" },
      response: null,
    })
    mocks.requireProBillingForApi.mockResolvedValue({
      ok: true,
    })
    mocks.createClient.mockResolvedValue(makeSupabaseMock())
    mocks.resolveTranslationSourceContext.mockResolvedValue({
      sourceVersionId: "ver-source",
      sourceVersion: { id: "ver-source", book_id: "00000000-0000-4000-8000-000000000001", language_code: "sv" },
      sourceLanguage: "sv",
      sourceLanguageOrigin: "version",
    })
    mocks.upsertBookTranslationState.mockResolvedValue(undefined)
    mocks.deleteBookTranslationState.mockResolvedValue(undefined)
  })

  it.each([true, false])("releases only a won Stripe claim after source-read failure (won: %s)", async (winsClaim) => {
    const bookId = "00000000-0000-4000-8000-000000000001"
    const sessionId = "cs_test_source_read_failure"
    let claimed = !winsClaim
    const events: string[] = []
    const insert = vi.fn(async () => {
      events.push("claim")
      if (claimed) return { error: { code: "23505", message: "Already claimed" } }
      claimed = true
      return { error: null }
    })
    const remove = vi.fn(() => {
      const filters: Record<string, string> = {}
      const query = {
        eq: (key: string, value: string) => { filters[key] = value; return query },
        then: async (resolve: (result: { error: null }) => unknown) => {
          expect(filters).toEqual({ stripe_session_id: sessionId, kind: "translation" })
          events.push("release")
          claimed = false
          return resolve({ error: null })
        },
      }
      return query
    })
    mocks.createAdminClient.mockReturnValue({ from: (table: string) => {
      expect(table).toBe("stripe_session_redemptions")
      return { insert, delete: remove }
    } })
    mocks.getStripeCheckoutSession.mockResolvedValue({
      payment_status: "paid",
      metadata: { payment_kind: "translation", user_id: "author-1", book_id: bookId },
    })
    mocks.resolveTranslationSourceContext.mockImplementationOnce(async () => {
      events.push("source-read")
      throw new Error("Chapter read failed")
    })

    const response = await POST(new Request(`http://localhost/api/books/${bookId}/translate`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetLanguage: "fr", sourceVersionId: "ver-source", sourceLanguage: "sv", stripeSessionId: sessionId }),
    }), { params: Promise.resolve({ id: bookId }) })
    events.push("response")

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ error: "TRANSLATION_SERVICE_UNAVAILABLE" })
    expect(insert).toHaveBeenCalledExactlyOnceWith({
      stripe_session_id: sessionId, kind: "translation", user_id: "author-1", book_id: bookId,
    })
    expect(remove).toHaveBeenCalledTimes(winsClaim ? 1 : 0)
    expect(claimed).toBe(!winsClaim)
    expect(events).toEqual(winsClaim ? ["claim", "source-read", "release", "response"] : ["claim", "source-read", "response"])
    expect(mocks.requireProBillingForApi).toHaveBeenCalledTimes(winsClaim ? 0 : 1)
    expect(mocks.enqueueTranslationJob).not.toHaveBeenCalled()
    expect(mocks.upsertBookTranslationState).not.toHaveBeenCalled()
  })

  it("blocks queue ingress while the reviewed rollout is held", async () => {
    mocks.activation.mockReturnValue(false)
    const res = await POST(new Request("http://localhost/api/books/book-1/translate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetLanguage: "en", sourceVersionId: "ver-source" }),
    }), { params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000001" }) })
    expect(res.status).toBe(503)
    expect(mocks.enqueueTranslationJob).not.toHaveBeenCalled()
    expect(mocks.upsertBookTranslationState).not.toHaveBeenCalled()
  })

  it.each(["nl", "pl"])("queues documented %s text translation using the selected source edition", async (language) => {
    mocks.enqueueTranslationJob.mockResolvedValueOnce(`job-${language}`)
    const res = await POST(new Request("http://localhost/api/books/book-1/translate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetLanguage: language, sourceVersionId: "ver-source" }),
    }), { params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000001" }) })
    expect(res.status).toBe(200)
    expect(mocks.enqueueTranslationJob).toHaveBeenCalledWith(expect.objectContaining({ targetLanguage: language, sourceVersionId: "ver-source", sourceLanguage: "sv" }))
  })

  it("keeps legacy single-language response shape", async () => {
    mocks.enqueueTranslationJob.mockResolvedValueOnce("job-1")

    const res = await POST(
      new Request("http://localhost/api/books/book-1/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetLanguage: "en",
          sourceVersionId: "ver-source",
        }),
      }),
      {
        params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000001" }),
      }
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({
      ok: true,
      jobId: "job-1",
      targetVersionId: null,
      chapterId: null,
    })
    expect(mocks.upsertBookTranslationState).not.toHaveBeenCalled()
    expect(mocks.enqueueTranslationJob).toHaveBeenCalledWith(
      expect.objectContaining({
        bookId: "00000000-0000-4000-8000-000000000001",
        sourceLanguage: "sv",
        sourceVersionId: "ver-source",
        targetLanguage: "en",
      })
    )
  })

  it("queues supported batch languages and rejects unsupported pairs", async () => {
    mocks.enqueueTranslationJob.mockResolvedValueOnce("job-en")
    // sv->en routes; sv->it is forced unroutable to exercise the rejection path.
    mocks.isTranslationPairSupported.mockImplementation(
      (_source: string, target: string) => target !== "it"
    )

    const res = await POST(
      new Request("http://localhost/api/books/book-1/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          languages: ["en", "it"],
          sourceVersionId: "ver-source",
        }),
      }),
      {
        params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000001" }),
      }
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.jobs).toEqual([
      {
        language: "en",
        jobId: "job-en",
        targetVersionId: null,
      },
    ])
    expect(body.rejected).toEqual([
      {
        language: "it",
        error: E_TRANSLATION_PAIR_UNSUPPORTED,
        detail: "sv -> it",
      },
    ])
    expect(mocks.enqueueTranslationJob).toHaveBeenCalledTimes(1)
    expect(mocks.upsertBookTranslationState).not.toHaveBeenCalled()
  })
})
