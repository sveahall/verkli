import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  E_TRANSLATION_PAIR_UNSUPPORTED,
} from "@/lib/api-errors"

const mocks = vi.hoisted(() => ({
  requireAuthorRoleForApi: vi.fn(),
  requireProBillingForApi: vi.fn(),
  createClient: vi.fn(),
  enqueueTranslationJob: vi.fn(),
  isTranslationsEnabled: vi.fn(),
  resolveTranslationSourceContext: vi.fn(),
  upsertBookTranslationState: vi.fn(),
  deleteBookTranslationState: vi.fn(),
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
}))

vi.mock("@/lib/book-translation", () => ({
  resolveTranslationSourceContext: mocks.resolveTranslationSourceContext,
  upsertBookTranslationState: mocks.upsertBookTranslationState,
  deleteBookTranslationState: mocks.deleteBookTranslationState,
}))

// Force in-memory rate limiter (no Redis)
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return { ...actual, getRedisUrl: () => null, getRedisConnectionOptions: () => undefined, getRedisClientOptions: () => undefined };
})

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

    const res = await POST(
      new Request("http://localhost/api/books/book-1/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // sv→en is supported (Opus), sv→it is unsupported (no provider for Italian)
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
    expect(mocks.upsertBookTranslationState).toHaveBeenCalledTimes(1)
  })
})
