import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock("@/lib/flags", () => ({
  isTtsLabEnabled: vi.fn(),
}));

const { isTtsLabEnabled } = await import("@/lib/flags");
const { GET } = await import("./route");

describe("GET /api/tts/qwen/preview/status", () => {
  beforeEach(() => {
    vi.mocked(isTtsLabEnabled).mockReturnValue(true);
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
        }),
      },
    });
    mocks.createAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "tts_preview_jobs") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: "job-123",
                    user_id: "user-1",
                    status: "succeeded",
                    progress: 100,
                    audio_path: "user-1/job-123.wav",
                    error: null,
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
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
        return {};
      }),
      storage: {
        from: vi.fn(() => ({
          createSignedUrl: vi.fn().mockResolvedValue({
            data: { signedUrl: "https://signed.example.com/audio.wav" },
            error: null,
          }),
        })),
      },
    });
  });

  it("rejects when not authenticated", async () => {
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    });

    const req = new Request("http://localhost/api/tts/qwen/preview/status?jobId=job-123");
    const res = await GET(req);

    expect(res.status).toBe(401);
  });

  it("rejects when jobId missing", async () => {
    const req = new Request("http://localhost/api/tts/qwen/preview/status");
    const res = await GET(req);

    expect(res.status).toBe(400);
  });

  it("returns status and signed audioUrl when job succeeded", async () => {
    const req = new Request("http://localhost/api/tts/qwen/preview/status?jobId=job-123");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("succeeded");
    expect(body.progress).toBe(100);
    expect(body.audioUrl).toBe("https://signed.example.com/audio.wav");
    expect(body.error).toBeNull();
  });

  it("returns status succeeded with audioUrl null and error AUDIO_SIGN_FAILED when signing fails", async () => {
    const admin = mocks.createAdminClient();
    admin.from = vi.fn((table: string) => {
      if (table === "tts_preview_jobs") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: "job-123",
                  user_id: "user-1",
                  status: "succeeded",
                  progress: 100,
                  audio_path: "user-1/job-123.wav",
                  error: null,
                },
                error: null,
              }),
            }),
          }),
        };
      }
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
      return {};
    });
    admin.storage = {
      from: vi.fn(() => ({
        createSignedUrl: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "sign failed" },
        }),
      })),
    };
    mocks.createAdminClient.mockReturnValue(admin);

    const req = new Request("http://localhost/api/tts/qwen/preview/status?jobId=job-123");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("succeeded");
    expect(body.audioUrl).toBeNull();
    expect(body.error).toBe("AUDIO_SIGN_FAILED");
  });

  it("returns 404 when job not found", async () => {
    const admin = mocks.createAdminClient();
    admin.from = vi.fn((table: string) => {
      if (table === "tts_preview_jobs") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        };
      }
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { role: "author" }, error: null }),
            }),
          }),
        };
      }
      return {};
    });
    mocks.createAdminClient.mockReturnValue(admin);

    const req = new Request("http://localhost/api/tts/qwen/preview/status?jobId=missing");
    const res = await GET(req);

    expect(res.status).toBe(404);
  });

  it("rejects when user does not own job", async () => {
    const admin = mocks.createAdminClient();
    admin.from = vi.fn((table: string) => {
      if (table === "tts_preview_jobs") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: "job-123",
                  user_id: "other-user",
                  status: "succeeded",
                  progress: 100,
                  audio_path: "other-user/job-123.wav",
                  error: null,
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { role: "author" }, error: null }),
            }),
          }),
        };
      }
      return {};
    });
    mocks.createAdminClient.mockReturnValue(admin);

    const req = new Request("http://localhost/api/tts/qwen/preview/status?jobId=job-123");
    const res = await GET(req);

    expect(res.status).toBe(404);
  });
});
