import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuthorRoleForApi: vi.fn(),
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  enqueueAudiobookJob: vi.fn(),
}));

vi.mock("@/lib/auth/require-author", () => ({
  requireAuthorRoleForApi: mocks.requireAuthorRoleForApi,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock("@/lib/audiobook-queue", () => ({
  enqueueAudiobookJob: mocks.enqueueAudiobookJob,
}));

const { POST } = await import("./route");

const originalEnv = {
  NEXT_PUBLIC_AUDIOBOOK_ENABLED: process.env.NEXT_PUBLIC_AUDIOBOOK_ENABLED,
  AUDIOBOOK_ENABLED: process.env.AUDIOBOOK_ENABLED,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
};

describe("POST /api/books/[id]/audiobook/generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_AUDIOBOOK_ENABLED = "false";
    process.env.AUDIOBOOK_ENABLED = "false";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_AUDIOBOOK_ENABLED = originalEnv.NEXT_PUBLIC_AUDIOBOOK_ENABLED;
    process.env.AUDIOBOOK_ENABLED = originalEnv.AUDIOBOOK_ENABLED;
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalEnv.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  it("returns 503 and never attempts enqueue when audiobook feature flag is off", async () => {
    const req = new Request("http://localhost/api/books/book-1/audiobook/generate", {
      method: "POST",
    });

    const res = await POST(req, { params: Promise.resolve({ id: "book-1" }) });
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body).toEqual({
      error: "Audiobook generation is temporarily unavailable in this environment",
    });
    expect(mocks.requireAuthorRoleForApi).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.enqueueAudiobookJob).not.toHaveBeenCalled();
  });
});
