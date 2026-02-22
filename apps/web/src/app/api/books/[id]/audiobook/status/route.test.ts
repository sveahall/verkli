import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { E_AUDIOBOOK_STATUS_UNAVAILABLE } from "@/lib/api-errors";
import { GET } from "./route";

const { requireAuthorRoleForApi, createClient, createAdminClient } = vi.hoisted(() => ({
  requireAuthorRoleForApi: vi.fn(),
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/auth/require-author", () => ({
  requireAuthorRoleForApi,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient,
}));

vi.mock("@/lib/tts/storage", () => ({
  getAudiobookStorageBucket: () => "audiobooks",
}));

const originalEnv = {
  NEXT_PUBLIC_AUDIOBOOK_ENABLED: process.env.NEXT_PUBLIC_AUDIOBOOK_ENABLED,
  AUDIOBOOK_ENABLED: process.env.AUDIOBOOK_ENABLED,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
};

describe("GET /api/books/[id]/audiobook/status", () => {
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

  it("returns 503 and skips auth/db lookup when feature flag is off", async () => {
    const req = new Request("http://localhost/api/books/book-1/audiobook/status");

    const res = await GET(req, { params: Promise.resolve({ id: "book-1" }) });
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body).toEqual({
      error: E_AUDIOBOOK_STATUS_UNAVAILABLE,
    });
    expect(requireAuthorRoleForApi).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });
});
