import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetUser = vi.fn();
const mockUpdateUser = vi.fn();
const mockProfilesUpsert = vi.fn();
const mockProfilesMaybeSingle = vi.fn();
const mockAiSettingsUpsert = vi.fn();
const mockMergePreferences = vi.fn();
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
    // Preference slices are merged by a single SQL statement now; the old
    // read-modify-write is what lost updates between settings pages.
    rpc: mockMergePreferences,
    auth: {
      getUser: mockGetUser,
      updateUser: mockUpdateUser,
    },
    from: (table: string) => {
      // Account AI preferences are saved by the same action as the rest of the
      // settings form, so the one "Save settings" button keeps its promise.
      if (table === "ai_memory_settings") {
        return { upsert: mockAiSettingsUpsert };
      }
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
  savePublishingDefaults,
  saveNotificationPreferences,
  changePassword,
  saveAiPreferences,
  switchRoleToReader,
} = await import("@/features/author/settings/actions");

describe("author settings actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "author-1" } } });
    mockUpdateUser.mockResolvedValue({ error: null });
    mockProfilesUpsert.mockResolvedValue({ error: null });
    mockAiSettingsUpsert.mockResolvedValue({ error: null });
    mockMergePreferences.mockResolvedValue({ data: {}, error: null });
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

  /**
   * Sections live on separate pages, so each form posts only its own fields.
   * A blind write of the whole preference blob would therefore reset whatever
   * the current page does not render — this pins that it does not.
   */
  /**
   * Sections live on separate pages, so each form posts only its own fields.
   * They used to be merged in application memory, which lost updates: two
   * sections saved moments apart both read the same JSON and the second write
   * restored the first one's old values. The merge is one SQL statement now, so
   * each page sends only the keys it owns and nothing can land in between.
   */
  it("sends only the publishing keys, and merges rather than rewriting the blob", async () => {
    const formData = new FormData();
    formData.set("default_language", "en");
    formData.set("default_visibility", "private");

    const result = await savePublishingDefaults({ ok: false, message: "" }, formData);

    expect(result).toEqual({ ok: true, message: "Publishing defaults saved." });
    expect(mockMergePreferences).toHaveBeenCalledWith("merge_profile_preferences", {
      p_user_id: "author-1",
      p_patch: {
        default_language: "en",
        default_visibility: "private",
        visibility: { shelves: "private", books: "private" },
      },
    });
    // Nothing reads or rewrites the whole preference blob any more.
    expect(mockProfilesUpsert).not.toHaveBeenCalled();
  });

  it("sends only the notification key it owns, leaving siblings to the recursive merge", async () => {
    const formData = new FormData();
    formData.set("email_notifications", "false");

    expect((await saveNotificationPreferences({ ok: false, message: "" }, formData)).ok).toBe(true);
    expect(mockMergePreferences).toHaveBeenCalledWith("merge_profile_preferences", {
      p_user_id: "author-1",
      p_patch: { notifications: { email: false } },
    });
    expect(mockProfilesUpsert).not.toHaveBeenCalled();
  });

  it("reports a failed merge instead of claiming the settings were saved", async () => {
    mockMergePreferences.mockResolvedValue({ data: null, error: { code: "40001", message: "serialization failure" } });
    const formData = new FormData();
    formData.set("email_notifications", "false");

    expect((await saveNotificationPreferences({ ok: false, message: "" }, formData)).ok).toBe(false);
  });

  it("changes the password only when both fields agree", async () => {
    const short = new FormData();
    short.set("new_password", "short");
    short.set("confirm_password", "short");
    expect((await changePassword({ ok: false, message: "" }, short)).message).toContain("8 characters");

    const mismatched = new FormData();
    mismatched.set("new_password", "password123");
    mismatched.set("confirm_password", "password124");
    expect((await changePassword({ ok: false, message: "" }, mismatched)).message).toContain("do not match");

    expect(mockUpdateUser).not.toHaveBeenCalled();

    const valid = new FormData();
    valid.set("new_password", "password123");
    valid.set("confirm_password", "password123");
    expect(await changePassword({ ok: false, message: "" }, valid)).toEqual({ ok: true, message: "Password updated." });
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: "password123" });
  });

  it("saves AI preferences to their own table and never touches profile preferences", async () => {
    const formData = new FormData();
    formData.set("ai_enabled", "true");
    formData.set("ai_memory_enabled", "false");
    formData.set("ai_reply_style", "candid");
    formData.set("ai_emoji", "less");
    formData.set("ai_nickname", "  Svea  ");
    formData.set("ai_instructions", "Never rewrite dialogue.");

    const result = await saveAiPreferences({ ok: false, message: "" }, formData);

    expect(result).toEqual({ ok: true, message: "AI settings saved." });
    expect(mockProfilesUpsert).not.toHaveBeenCalled();
    expect(mockAiSettingsUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        owner_id: "author-1",
        ai_enabled: true,
        enabled: false,
        reply_style: "candid",
        emoji: "less",
        nickname: "Svea",
        craft: null,
        instructions: "Never rewrite dialogue.",
      }),
      { onConflict: "owner_id" }
    );
  });

  it("rejects an invalid AI choice before writing anything", async () => {
    const formData = new FormData();
    formData.set("ai_enabled", "true");
    formData.set("ai_reply_style", "sarcastic");

    const result = await saveAiPreferences({ ok: false, message: "" }, formData);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("AI settings");
    expect(mockAiSettingsUpsert).not.toHaveBeenCalled();
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

});
