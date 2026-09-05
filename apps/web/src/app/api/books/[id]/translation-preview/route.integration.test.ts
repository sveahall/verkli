import { beforeEach, describe, expect, it, vi } from "vitest";

const BOOK_ID = "00000000-0000-4000-8000-000000000001";
const VERSION_SV = "00000000-0000-4000-8000-000000000011";
const VERSION_EN = "00000000-0000-4000-8000-000000000012";
const VERSION_FOREIGN = "00000000-0000-4000-8000-000000000099";
const VERSION_MISSING = "00000000-0000-4000-8000-000000000098";
const anthropicCreate = vi.hoisted(() => vi.fn());
const requireAuthorRoleForApi = vi.hoisted(() => vi.fn());
const createClient = vi.hoisted(() => vi.fn());

vi.mock("@anthropic-ai/sdk", () => {
  class MockAnthropic {
    messages = { create: (...args: unknown[]) => anthropicCreate(...args) };
  }
  return { default: MockAnthropic };
});

vi.mock("@/lib/auth/require-author", () => ({ requireAuthorRoleForApi }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));

const { GET } = await import("./route");

type Version = { id: string; book_id: string; language_code: string };
type Chapter = { book_version_id: string; content: string; source_text: string | null; order: number };

function makeDatabase({
  versions,
  chapters,
}: {
  versions: Version[];
  chapters: Chapter[];
}) {
  class Query implements PromiseLike<{ data: unknown; error: null }> {
    private filters = new Map<string, unknown>();

    constructor(private table: string) {}

    select() { return this; }
    update() { return this; }
    eq(column: string, value: unknown) { this.filters.set(column, value); return this; }
    order() { return this; }
    limit() { return this; }

    async maybeSingle() {
      if (this.table === "books") {
        return {
          data: this.filters.get("id") === BOOK_ID
            ? { id: BOOK_ID, author_id: "author-1", original_language: "sv", language: "sv" }
            : null,
          error: null,
        };
      }

      if (this.table === "book_versions") {
        const data = versions.find((version) =>
          [...this.filters].every(([column, value]) => version[column as keyof Version] === value)
        ) ?? null;
        return { data, error: null };
      }

      if (this.table === "chapters") {
        const data = chapters.find((chapter) =>
          [...this.filters].every(([column, value]) => chapter[column as keyof Chapter] === value)
        ) ?? null;
        return { data, error: null };
      }

      throw new Error(`Unexpected table: ${this.table}`);
    }

    then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
      onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
      const data = this.table === "chapters"
        ? chapters.filter((chapter) =>
            [...this.filters].every(([column, value]) => chapter[column as keyof Chapter] === value)
          ).sort((a, b) => a.order - b.order)
        : [];
      return Promise.resolve({ data, error: null }).then(onfulfilled, onrejected);
    }
  }

  return { from: (table: string) => new Query(table) };
}

const versions: Version[] = [
  { id: VERSION_SV, book_id: BOOK_ID, language_code: "sv" },
  { id: VERSION_EN, book_id: BOOK_ID, language_code: "en" },
  { id: VERSION_FOREIGN, book_id: "00000000-0000-4000-8000-000000000097", language_code: "en" },
];

const chapters: Chapter[] = [
  { book_version_id: VERSION_SV, content: "Svensk källa", source_text: null, order: 1 },
  { book_version_id: VERSION_EN, content: "English source", source_text: null, order: 1 },
];

async function request(query: string) {
  return GET(new Request(`http://localhost/api/books/${BOOK_ID}/translation-preview?${query}`), {
    params: Promise.resolve({ id: BOOK_ID }),
  });
}

describe("translation preview route with the real resolver and provider registry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.OPUSMT_ENABLED;
    delete process.env.OPUSMT_PYTHON;
    delete process.env.OPUSMT_MODELS_DIR;
    process.env.ANTHROPIC_API_KEY = "synthetic-key";
    requireAuthorRoleForApi.mockResolvedValue({ user: { id: "author-1" }, response: null });
    createClient.mockResolvedValue(makeDatabase({ versions, chapters }));
  });

  it("uses the requested same-book version and its trusted language", async () => {
    anthropicCreate.mockResolvedValue({
      stop_reason: "end_turn",
      content: [{ type: "text", text: '["Svensk översättning"]' }],
    });

    const response = await request(`targetLanguage=sv&sourceVersionId=${VERSION_EN}`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      originalText: "English source",
      translatedText: "Svensk översättning",
    });
    expect(JSON.stringify(anthropicCreate.mock.calls[0][0])).toContain("English source");
  });

  it("retains default-version behavior when sourceVersionId is omitted", async () => {
    anthropicCreate.mockResolvedValue({
      stop_reason: "end_turn",
      content: [{ type: "text", text: '["English translation"]' }],
    });

    const response = await request("targetLanguage=en");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ originalText: "Svensk källa" });
    expect(JSON.stringify(anthropicCreate.mock.calls[0][0])).toContain("Svensk källa");
  });

  it.each([VERSION_MISSING, VERSION_FOREIGN])(
    "rejects requested version %s without fallback or provider access",
    async (sourceVersionId) => {
      const response = await request(`targetLanguage=en&sourceVersionId=${sourceVersionId}`);

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ error: "INVALID_SOURCE_VERSION" });
      expect(anthropicCreate).not.toHaveBeenCalled();
    },
  );

  it("preserves the selected source when the real adapter rejects malformed output", async () => {
    anthropicCreate.mockResolvedValue({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "model prose without JSON" }],
    });

    const response = await request(`targetLanguage=sv&sourceVersionId=${VERSION_EN}`);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "TRANSLATION_SERVICE_UNAVAILABLE",
      originalText: "English source",
      translatedText: "",
      previewText: "",
      previewUnavailable: true,
    });
  });
});
