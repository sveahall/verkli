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
  isLegacyAuthorRole: (role: string | null | undefined) =>
    String(role ?? "").toLowerCase() === "author",
}));

const { requireAuthorRole, requireAuthorRoleForApi } = await import(
  "@/lib/auth/require-author"
);
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

function mockProfileQuery(role: string | null) {
  mockFrom.mockReturnValue({
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: role !== null ? { role } : null, error: null }),
      }),
    }),
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────
describe("security: requireAuthorRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no user session exists", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const result = await requireAuthorRole();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });

  it("allows access when profiles.role is author", async () => {
    mockGetUser.mockResolvedValue({ data: { user: mockUser("u1") } });
    mockProfileQuery("author");

    const result = await requireAuthorRole();
    expect(result.ok).toBe(true);
  });

  it("REJECTS user whose user_metadata.role is author but profiles.role is reader", async () => {
    // This is the core security fix — metadata must NOT grant author access
    const user = mockUser("u1", "author"); // metadata says author
    mockGetUser.mockResolvedValue({ data: { user } });
    mockProfileQuery("reader"); // DB says reader

    vi.mocked(getAuthorApplicationStatus).mockResolvedValue(null);

    const result = await requireAuthorRole();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("REJECTS user whose user_metadata.role is author but profile is missing", async () => {
    const user = mockUser("u1", "author");
    mockGetUser.mockResolvedValue({ data: { user } });
    mockProfileQuery(null); // no profile row

    vi.mocked(getAuthorApplicationStatus).mockResolvedValue(null);

    const result = await requireAuthorRole();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("allows reader with approved author application", async () => {
    mockGetUser.mockResolvedValue({ data: { user: mockUser("u1") } });
    mockProfileQuery("reader");

    vi.mocked(getAuthorApplicationStatus).mockResolvedValue("approved");

    const result = await requireAuthorRole();
    expect(result.ok).toBe(true);
  });

  it("requireAuthorRoleForApi returns JSON response on failure", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const { user, response } = await requireAuthorRoleForApi();
    expect(user).toBeNull();
    expect(response).not.toBeNull();
    expect(response!.status).toBe(401);
  });
});
