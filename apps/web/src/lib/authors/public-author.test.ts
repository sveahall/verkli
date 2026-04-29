import { beforeEach, describe, expect, it, vi } from "vitest";

const adminMock = vi.hoisted(() => {
  const profilesIn = vi.fn();
  const getUserById = vi.fn();
  return {
    profilesIn,
    getUserById,
    createAdminClient: vi.fn(() => ({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          in: profilesIn,
        })),
      })),
      auth: {
        admin: {
          getUserById,
        },
      },
    })),
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: adminMock.createAdminClient,
}));

const { getPublicAuthorInfoMap, resolvePublicAuthorName } = await import("./public-author");

describe("getPublicAuthorInfoMap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an empty map for no input", async () => {
    const result = await getPublicAuthorInfoMap([]);
    expect(result.size).toBe(0);
    expect(adminMock.createAdminClient).not.toHaveBeenCalled();
  });

  it("uses profiles.display_name when present and skips auth lookup", async () => {
    adminMock.profilesIn.mockResolvedValue({
      data: [
        { user_id: "u-1", display_name: "Lassebasse", username: null, avatar_url: null },
      ],
      error: null,
    });

    const result = await getPublicAuthorInfoMap(["u-1"]);
    expect(result.get("u-1")?.display_name).toBe("Lassebasse");
    expect(adminMock.getUserById).not.toHaveBeenCalled();
  });

  it("falls back to auth metadata name when profile fields are empty", async () => {
    adminMock.profilesIn.mockResolvedValue({
      data: [
        { user_id: "u-2", display_name: null, username: "  ", avatar_url: null },
      ],
      error: null,
    });
    adminMock.getUserById.mockResolvedValue({
      data: {
        user: { user_metadata: { name: "Real Name", avatar_url: "https://cdn.example.com/a.jpg" } },
      },
      error: null,
    });

    const result = await getPublicAuthorInfoMap(["u-2"]);
    expect(result.get("u-2")?.display_name).toBe("Real Name");
    expect(result.get("u-2")?.avatar_url).toBe("https://cdn.example.com/a.jpg");
    expect(adminMock.getUserById).toHaveBeenCalledWith("u-2");
  });

  it("includes users with no profile row but resolvable auth metadata", async () => {
    adminMock.profilesIn.mockResolvedValue({ data: [], error: null });
    adminMock.getUserById.mockResolvedValue({
      data: { user: { user_metadata: { full_name: "Auth Only" } } },
      error: null,
    });

    const result = await getPublicAuthorInfoMap(["u-3"]);
    expect(result.get("u-3")).toEqual({
      user_id: "u-3",
      display_name: "Auth Only",
      username: null,
      avatar_url: null,
    });
  });

  it("prefers profile avatar over auth metadata avatar when both exist", async () => {
    adminMock.profilesIn.mockResolvedValue({
      data: [
        { user_id: "u-4", display_name: "X", username: null, avatar_url: "profile-path.jpg" },
      ],
      error: null,
    });
    adminMock.getUserById.mockResolvedValue({
      data: { user: { user_metadata: { name: "X", avatar_url: "https://cdn.example.com/a.jpg" } } },
      error: null,
    });

    const result = await getPublicAuthorInfoMap(["u-4"]);
    expect(result.get("u-4")?.avatar_url).toBe("profile-path.jpg");
    // auth lookup was not needed since profile already has display_name
    expect(adminMock.getUserById).not.toHaveBeenCalled();
  });

  it("deduplicates input user_ids before querying profiles", async () => {
    adminMock.profilesIn.mockResolvedValue({ data: [], error: null });
    adminMock.getUserById.mockResolvedValue({ data: { user: null }, error: null });

    await getPublicAuthorInfoMap(["u-1", "u-1", "u-2", ""]);
    expect(adminMock.profilesIn).toHaveBeenCalledWith("user_id", ["u-1", "u-2"]);
  });

  it("omits users with no resolvable info", async () => {
    adminMock.profilesIn.mockResolvedValue({ data: [], error: null });
    adminMock.getUserById.mockResolvedValue({
      data: { user: { user_metadata: {} } },
      error: null,
    });

    const result = await getPublicAuthorInfoMap(["u-5"]);
    expect(result.has("u-5")).toBe(false);
  });

  it("survives auth lookup errors silently", async () => {
    adminMock.profilesIn.mockResolvedValue({ data: [], error: null });
    adminMock.getUserById.mockRejectedValue(new Error("boom"));

    const result = await getPublicAuthorInfoMap(["u-6"]);
    expect(result.has("u-6")).toBe(false);
  });
});

describe("resolvePublicAuthorName", () => {
  it("falls back to 'Author' when info is missing", () => {
    expect(resolvePublicAuthorName(undefined)).toBe("Author");
    expect(resolvePublicAuthorName(null)).toBe("Author");
  });

  it("uses display_name when present", () => {
    expect(
      resolvePublicAuthorName({
        user_id: "u",
        display_name: "Real Name",
        username: "handle",
        avatar_url: null,
      })
    ).toBe("Real Name");
  });

  it("falls back to username when display_name is empty", () => {
    expect(
      resolvePublicAuthorName({
        user_id: "u",
        display_name: "  ",
        username: "handle",
        avatar_url: null,
      })
    ).toBe("handle");
  });

  it("falls back to 'Author' when both display_name and username are empty", () => {
    expect(
      resolvePublicAuthorName({
        user_id: "u",
        display_name: "",
        username: null,
        avatar_url: null,
      })
    ).toBe("Author");
  });
});
