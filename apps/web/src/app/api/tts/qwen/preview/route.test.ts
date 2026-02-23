import { beforeEach, describe, expect, it, vi } from "vitest";
import { E_RATE_LIMIT_EXCEEDED, E_TTS_PREVIEW_INVALID_VOICE } from "@/lib/api-errors";

const mocks = vi.hoisted(() => ({
  requireAuthorRoleForApi: vi.fn(),
  createAdminClient: vi.fn(),
  ttsInsert: vi.fn(),
  rateLimiterCheck: vi.fn(),
  existingJobMaybeSingle: vi.fn(),
}));

vi.mock("@/lib/auth/require-author", () => ({
  requireAuthorRoleForApi: mocks.requireAuthorRoleForApi,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock("@/lib/flags", () => ({
  isTtsLabEnabled: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  createPerUserRateLimiter: () => ({ check: mocks.rateLimiterCheck }),
}));

const { isTtsLabEnabled } = await import("@/lib/flags");
const { POST } = await import("./route");

function makeAdminMock() {
  return {
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { role: "author" },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "tts_preview_jobs") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: mocks.existingJobMaybeSingle,
                  }),
                }),
              }),
            }),
          }),
          insert: mocks.ttsInsert,
        };
      }
      return {};
    }),
  };
}

describe("POST /api/tts/qwen/preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isTtsLabEnabled).mockReturnValue(true);
    mocks.rateLimiterCheck.mockReturnValue({ allowed: true });
    mocks.existingJobMaybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.ttsInsert.mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: "job-123" },
          error: null,
        }),
      }),
    });
    mocks.createAdminClient.mockImplementation(() => makeAdminMock());
  });

  it("rejects when not authenticated", async () => {
    mocks.requireAuthorRoleForApi.mockResolvedValue({
      user: null,
      response: new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 }),
    });

    const req = new Request("http://localhost/api/tts/qwen/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Hej", voiceId: "Ryan" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("creates job and returns jobId when auth ok", async () => {
    mocks.requireAuthorRoleForApi.mockResolvedValue({
      user: { id: "user-1" },
      response: null,
    });

    const req = new Request("http://localhost/api/tts/qwen/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Hej världen", voiceId: "Ryan" }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ jobId: "job-123" });
    expect(mocks.ttsInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        text: "Hej världen",
        voice_id: "Ryan",
        status: "queued",
        progress: 0,
      })
    );
  });

  it("returns 404 when TTS Lab is disabled", async () => {
    vi.mocked(isTtsLabEnabled).mockReturnValue(false);
    mocks.requireAuthorRoleForApi.mockResolvedValue({
      user: { id: "user-1" },
      response: null,
    });

    const req = new Request("http://localhost/api/tts/qwen/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Hej", voiceId: "Ryan" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("rejects empty text", async () => {
    mocks.requireAuthorRoleForApi.mockResolvedValue({
      user: { id: "user-1" },
      response: null,
    });

    const req = new Request("http://localhost/api/tts/qwen/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "   ", voiceId: "Ryan" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 429 when rate limit exceeded", async () => {
    mocks.requireAuthorRoleForApi.mockResolvedValue({
      user: { id: "user-1" },
      response: null,
    });
    mocks.rateLimiterCheck.mockReturnValue({ allowed: false, retryAfterSeconds: 45 });

    const req = new Request("http://localhost/api/tts/qwen/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Hej", voiceId: "Ryan" }),
    });

    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(429);
    expect(body.error).toBe(E_RATE_LIMIT_EXCEEDED);
    expect(mocks.ttsInsert).not.toHaveBeenCalled();
  });

  it("returns 202 with existing jobId when user has queued/running job", async () => {
    mocks.requireAuthorRoleForApi.mockResolvedValue({
      user: { id: "user-1" },
      response: null,
    });
    mocks.existingJobMaybeSingle.mockResolvedValue({
      data: { id: "existing-job-1" },
      error: null,
    });

    const req = new Request("http://localhost/api/tts/qwen/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Hej", voiceId: "Ryan" }),
    });

    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(202);
    expect(body).toEqual({ jobId: "existing-job-1" });
    expect(mocks.ttsInsert).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid voiceId", async () => {
    mocks.requireAuthorRoleForApi.mockResolvedValue({
      user: { id: "user-1" },
      response: null,
    });

    const req = new Request("http://localhost/api/tts/qwen/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Hej", voiceId: "InvalidVoice" }),
    });

    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe(E_TTS_PREVIEW_INVALID_VOICE);
    expect(mocks.ttsInsert).not.toHaveBeenCalled();
  });

  it("rejects text over 500 chars", async () => {
    mocks.requireAuthorRoleForApi.mockResolvedValue({
      user: { id: "user-1" },
      response: null,
    });

    const req = new Request("http://localhost/api/tts/qwen/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "x".repeat(501), voiceId: "Ryan" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
