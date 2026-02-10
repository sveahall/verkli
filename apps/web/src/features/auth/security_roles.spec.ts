import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────
const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
      from: mockFrom,
    })
  ),
}));

vi.mock("@/lib/auth/author-approval", () => ({
  getAuthorApplicationStatus: vi.fn(() => Promise.resolve(null)),
}));

const { updateActiveRole } = await import("@/features/auth/roles");
const { getAuthorApplicationStatus } = await import(
  "@/lib/auth/author-approval"
);

// ─── Helpers ────────────────────────────────────────────────────────────────
function mockUser(id: string, metadataRole?: string) {
  return {
    id,
    user_metadata: metadataRole ? { role: metadataRole } : {},
  };
}

function mockProfileSelect(role: string | null, preferences: Record<string, unknown> | null = null) {
  // profiles select("role, preferences") → eq → maybeSingle
  const selectChain = {
    eq: () => ({
      maybeSingle: () =>
        Promise.resolve({
          data: { role, preferences },
          error: null,
        }),
    }),
  };
  // profiles upsert → ok
  const upsertChain = Promise.resolve({ error: null });

  mockFrom.mockImplementation((table: string) => {
    if (table === "profiles") {
      return {
        select: () => selectChain,
        upsert: () => upsertChain,
      };
    }
    return {};
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────
describe("security: updateActiveRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const result = await updateActiveRole("author");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Not authenticated/i);
  });

  it("allows author (profiles.role) to switch to reader", async () => {
    mockGetUser.mockResolvedValue({ data: { user: mockUser("u1") } });
    mockProfileSelect("author");

    const result = await updateActiveRole("reader");
    expect(result.ok).toBe(true);
  });

  it("allows author (profiles.role) to switch back to author", async () => {
    mockGetUser.mockResolvedValue({ data: { user: mockUser("u1") } });
    mockProfileSelect("author", { active_role: "reader" });

    const result = await updateActiveRole("author");
    expect(result.ok).toBe(true);
  });

  it("REJECTS reader switching to author without approval — even if metadata says author", async () => {
    // Core security test: user_metadata.role = "author" must be IGNORED
    const user = mockUser("u1", "author"); // metadata claims author
    mockGetUser.mockResolvedValue({ data: { user } });
    mockProfileSelect("reader"); // DB says reader

    vi.mocked(getAuthorApplicationStatus).mockResolvedValue(null);

    const result = await updateActiveRole("author");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Author approval required/i);
  });

  it("REJECTS user with no profile row trying to switch to author", async () => {
    mockGetUser.mockResolvedValue({ data: { user: mockUser("u1", "author") } });
    // Simulate missing profile
    mockFrom.mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
          upsert: () => Promise.resolve({ error: null }),
        };
      }
      return {};
    });

    vi.mocked(getAuthorApplicationStatus).mockResolvedValue(null);

    const result = await updateActiveRole("author");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Author approval required/i);
  });

  it("allows reader with approved application to switch to author", async () => {
    mockGetUser.mockResolvedValue({ data: { user: mockUser("u1") } });
    mockProfileSelect("reader");

    vi.mocked(getAuthorApplicationStatus).mockResolvedValue("approved");

    const result = await updateActiveRole("author");
    expect(result.ok).toBe(true);
  });

  it("never writes profiles.role — only preferences.active_role", async () => {
    mockGetUser.mockResolvedValue({ data: { user: mockUser("u1") } });

    const upsertSpy = vi.fn(() => Promise.resolve({ error: null }));
    mockFrom.mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: { role: "author", preferences: {} }, error: null }),
            }),
          }),
          upsert: upsertSpy,
        };
      }
      return {};
    });

    await updateActiveRole("reader");

    expect(upsertSpy).toHaveBeenCalledTimes(1);
    const [upsertArg] = upsertSpy.mock.calls[0] as [Record<string, unknown>];
    // Must NOT contain a `role` field
    expect(upsertArg).not.toHaveProperty("role");
    // Must contain preferences with active_role
    expect(upsertArg).toHaveProperty("preferences");
    expect((upsertArg.preferences as Record<string, unknown>).active_role).toBe("reader");
  });
});
