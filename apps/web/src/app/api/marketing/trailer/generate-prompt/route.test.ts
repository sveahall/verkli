import { beforeEach, describe, expect, it, vi } from "vitest";
import { E_TRAILER_GENERATION_FAILED, E_VALIDATION_FAILED } from "@/lib/api-errors";

const mocks = vi.hoisted(() => ({
  requireAuthorAndMarketingEnabled: vi.fn(),
  generateTrailerPrompt: vi.fn(),
}));

vi.mock("@/lib/auth/require-author-marketing", () => ({
  requireAuthorAndMarketingEnabled: mocks.requireAuthorAndMarketingEnabled,
}));

// Mock server-only to prevent import error in test
vi.mock("server-only", () => ({}));

vi.mock("@/lib/ai/trailer-generation/generate", () => ({
  generateTrailerPrompt: mocks.generateTrailerPrompt,
}));

const { POST } = await import("./route");

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/marketing/trailer/generate-prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  title: "Test Book",
  genre: "romance",
  description: "A beautiful love story set in the countryside.",
  keywords: ["love", "summer"],
  tone: "dreamy",
};

const MOCK_OUTPUT = {
  output: {
    scenes: [
      { visual_prompt: "Scene 1", duration: 5 },
      { visual_prompt: "Scene 2", duration: 5 },
      { visual_prompt: "Scene 3", duration: 5 },
    ],
    caption: "A caption",
    hashtags: ["#book"],
    title_card: "Title",
  },
  metadata: { model: "test" },
};

describe("POST /api/marketing/trailer/generate-prompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthorAndMarketingEnabled.mockResolvedValue({
      user: { id: "user-1" },
      response: null,
    });
  });

  it("returns 400 for invalid body", async () => {
    const res = await POST(makeRequest({ title: "" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe(E_VALIDATION_FAILED);
  });

  it("returns trailer output on success", async () => {
    mocks.generateTrailerPrompt.mockResolvedValue(MOCK_OUTPUT);

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.output.scenes).toHaveLength(3);
    expect(body.output.caption).toBe("A caption");
    expect(body.metadata).toBeDefined();
  });

  it("returns 500 when generation throws", async () => {
    mocks.generateTrailerPrompt.mockRejectedValue(new Error("LLM failed"));

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe(E_TRAILER_GENERATION_FAILED);
  });

  it("returns auth error when not authorized", async () => {
    mocks.requireAuthorAndMarketingEnabled.mockResolvedValue({
      user: null,
      response: new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
      }),
    });

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
  });
});
