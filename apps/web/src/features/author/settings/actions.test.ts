import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetUser = vi.fn();
const mockUpdateUser = vi.fn();
const mockProfilesUpsert = vi.fn();
const mockProfilesMaybeSingle = vi.fn();
const mockUpdateActiveRole = vi.fn();
const mockRequireAuthorRole = vi.fn();
const mockRevalidatePath = vi.fn();
const mockCookieSet = vi.fn();
const mockCookies = vi.fn(async () => ({ set: mockCookieSet }));
const mockRedirect = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT:${path}`);
});

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock("next/headers", () => ({
  cookies: mockCookies,
}));

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: mockGetUser,
      updateUser: mockUpdateUser,
    },
    from: (table: string) => {
      if (table !== "profiles") {
        throw new Error(`Unexpected table: ${table}`);
      }

      return {
        upsert: mockProfilesUpsert,
        select: () => ({
          eq: () => ({
            maybeSingle: mockProfilesMaybeSingle,
          }),
        }),
      };
    },
  })),
}));

vi.mock("@/features/auth/roles", () => ({
  updateActiveRole: mockUpdateActiveRole,
}));

vi.mock("@/lib/auth/require-author", () => ({
  requireAuthorRole: mockRequireAuthorRole,
}));

const {
  saveAuthorProfile,
  saveAuthorSettings,
  switchRoleToReader,
} = await import("@/features/author/settings/actions");

describe("author settings actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "author-1" } } });
    mockUpdateUser.mockResolvedValue({ error: null });
    mockProfilesUpsert.mockResolvedValue({ error: null });
    mockProfilesMaybeSingle.mockResolvedValue({ data: { preferences: {} }, error: null });
    mockUpdateActiveRole.mockResolvedValue({ ok: true });
    mockRequireAuthorRole.mockResolvedValue({ ok: true, user: { id: "author-1" } });
  });

  it("sets the active_role cookie before redirecting to reader home", async () => {
    await expect(switchRoleToReader()).rejects.toThrow("NEXT_REDIRECT:/reader/home");

    expect(mockUpdateActiveRole).toHaveBeenCalledWith("reader");
    expect(mockCookies).toHaveBeenCalledTimes(1);
    expect(mockCookieSet).toHaveBeenCalledWith("active_role", "reader", {
      path: "/",
      sameSite: "lax",
      maxAge: 31536000,
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/author");
  });

  it("does not set the cookie when the role update fails", async () => {
    mockUpdateActiveRole.mockResolvedValue({ ok: false, error: "db failed" });

    await expect(switchRoleToReader()).rejects.toThrow("NEXT_REDIRECT:/author/settings");

    expect(mockCookieSet).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("saves the simplified author profile", async () => {
    const formData = new FormData();
    formData.set("display_name", "Jane Author");
    formData.set("bio", "Writes Scandinavian fiction.");
    formData.set("is_public", "true");

    const result = await saveAuthorProfile({ ok: false, message: "" }, formData);

    expect(result).toEqual({ ok: true, message: "Profile saved." });
    expect(mockProfilesUpsert).toHaveBeenCalledWith(
      {
        user_id: "author-1",
        display_name: "Jane Author",
        bio: "Writes Scandinavian fiction.",
        is_public: true,
        website_url: null,
        social_links: {},
      },
      { onConflict: "user_id" }
    );
    expect(mockUpdateUser).toHaveBeenCalledWith({
      data: {
        full_name: "Jane Author",
      },
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/author/profile");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/author/settings");
  });

  it("merges simplified settings into profile preferences", async () => {
    mockProfilesMaybeSingle.mockResolvedValue({
      data: {
        preferences: {
          active_role: "author",
          notifications: { sms: false },
        },
      },
      error: null,
    });

    const formData = new FormData();
    formData.set("default_language", "en");
    formData.set("default_visibility", "private");
    formData.set("email_notifications", "true");
    formData.set("new_password", "password123");
    formData.set("confirm_password", "password123");

    const result = await saveAuthorSettings({ ok: false, message: "" }, formData);

    expect(result).toEqual({ ok: true, message: "Settings and password saved." });
    expect(mockProfilesUpsert).toHaveBeenCalledWith(
      {
        user_id: "author-1",
        preferences: {
          active_role: "author",
          default_language: "en",
          default_visibility: "private",
          visibility: {
            shelves: "private",
            books: "private",
          },
          notifications: {
            sms: false,
            email: true,
          },
        },
      },
      { onConflict: "user_id" }
    );
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: "password123" });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/author/settings");
  });
});
