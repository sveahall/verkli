import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  E_BOOK_NOT_FOUND,
  E_COVER_GENERATION_FAILED,
  E_PROMPT_TEXT_REQUIRED,
  E_VALIDATION_FAILED,
} from "@/lib/api-errors";

const mocks = vi.hoisted(() => ({
  requireAuthorRoleForApi: vi.fn(),
  createAdminClient: vi.fn(),
  generateCoverImages: vi.fn(),
}));

vi.mock("@/lib/auth/require-author", () => ({
  requireAuthorRoleForApi: mocks.requireAuthorRoleForApi,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock("@/lib/higgsfield", () => ({
  generateCoverImages: (...args: unknown[]) => mocks.generateCoverImages(...args),
}));

const { POST, maxDuration } = await import("./route");

function makeRequest(payload: unknown) {
  return new Request("http://localhost/api/books/book-1/cover/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function mockBookLookup({ found }: { found: boolean }) {
  const booksMaybeSingle = vi.fn().mockResolvedValue({
    data: found ? { id: "book-1", title: "The Snow Fox" } : null,
    error: null,
  });
  const booksEqAuthor = vi.fn(() => ({ maybeSingle: booksMaybeSingle }));
  const booksEqId = vi.fn(() => ({ eq: booksEqAuthor }));
  const booksSelect = vi.fn(() => ({ eq: booksEqId }));

  const bookGenresEq = vi.fn(() => ({
    data: found ? [{ genre_id: "genre-1" }] : [],
    error: null,
  }));
  const bookGenresSelect = vi.fn(() => ({ eq: bookGenresEq }));

  const genresIn = vi.fn(() => ({
    data: found ? [{ name_en: "Business", name_sv: "Affar", slug: "business" }] : [],
    error: null,
  }));
  const genresSelect = vi.fn(() => ({ in: genresIn }));

  const from = vi.fn((table: string) => {
    if (table === "books") return { select: booksSelect };
    if (table === "book_genres") return { select: bookGenresSelect };
    if (table === "genres") return { select: genresSelect };
    throw new Error(`Unexpected table in test: ${table}`);
  });

  mocks.createAdminClient.mockReturnValue({ from });
}

describe("POST /api/books/[id]/cover/generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthorRoleForApi.mockResolvedValue({
      user: { id: "author-1" },
      response: null,
    });
  });

  it("enforces maxDuration 180s", () => {
    expect(maxDuration).toBe(180);
  });

  it("returns 400 for invalid JSON", async () => {
    const request = new Request("http://localhost/api/books/book-1/cover/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });

    const response = await POST(request, { params: Promise.resolve({ id: "book-1" }) });

    expect(response.status).toBe(400);
  });

  it("returns 400 when prompt is blank", async () => {
    const response = await POST(
      makeRequest({
        prompt: "   ",
        style: "minimal",
      }),
      { params: Promise.resolve({ id: "book-1" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe(E_PROMPT_TEXT_REQUIRED);
  });

  it("returns 400 for invalid style", async () => {
    const response = await POST(
      makeRequest({
        prompt: "A fox in snow",
        style: "invalid-style",
      }),
      { params: Promise.resolve({ id: "book-1" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe(E_VALIDATION_FAILED);
  });

  it("returns 404 when book is not owned", async () => {
    mockBookLookup({ found: false });

    const response = await POST(
      makeRequest({
        prompt: "A fox in snow",
        style: "minimal",
      }),
      { params: Promise.resolve({ id: "book-1" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe(E_BOOK_NOT_FOUND);
  });

  it("returns 4 generated image URLs", async () => {
    mockBookLookup({ found: true });
    mocks.generateCoverImages.mockResolvedValue({
      requestId: "req-1",
      imageUrls: [
        "https://cdn.example.com/cover-1.jpg",
        "https://cdn.example.com/cover-2.jpg",
        "https://cdn.example.com/cover-3.jpg",
        "https://cdn.example.com/cover-4.jpg",
      ],
    });

    const response = await POST(
      makeRequest({
        prompt: "A fox in snow",
        style: "illustrated",
      }),
      { params: Promise.resolve({ id: "book-1" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      requestId: "req-1",
      images: [
        "https://cdn.example.com/cover-1.jpg",
        "https://cdn.example.com/cover-2.jpg",
        "https://cdn.example.com/cover-3.jpg",
        "https://cdn.example.com/cover-4.jpg",
      ],
    });
    expect(mocks.generateCoverImages).toHaveBeenCalledWith({
      prompt: expect.stringContaining('book titled "The Snow Fox"'),
    });
    expect(mocks.generateCoverImages).toHaveBeenCalledWith({
      prompt: expect.stringContaining("Business book cover"),
    });
    expect(mocks.generateCoverImages).toHaveBeenCalledWith({
      prompt: expect.stringContaining("centered title layout"),
    });
  });

  it("returns 502 when Higgsfield generation fails", async () => {
    mockBookLookup({ found: true });
    mocks.generateCoverImages.mockRejectedValue(new Error("Higgsfield timeout"));

    const response = await POST(
      makeRequest({
        prompt: "A fox in snow",
        style: "minimal",
      }),
      { params: Promise.resolve({ id: "book-1" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error).toBe(E_COVER_GENERATION_FAILED);
  });
});
