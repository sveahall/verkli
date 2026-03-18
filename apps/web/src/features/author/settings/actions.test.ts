import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetUser = vi.fn();
const mockUpdateActiveRole = vi.fn();
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
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@/features/auth/roles", () => ({
  updateActiveRole: mockUpdateActiveRole,
}));

vi.mock("@/lib/auth/require-author", () => ({
  requireAuthorRole: vi.fn(),
}));

const { switchRoleToReader } = await import("@/features/author/settings/actions");

describe("switchRoleToReader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets the active_role cookie before redirecting to reader home", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "author-1" } } });
    mockUpdateActiveRole.mockResolvedValue({ ok: true });

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
    mockGetUser.mockResolvedValue({ data: { user: { id: "author-1" } } });
    mockUpdateActiveRole.mockResolvedValue({ ok: false, error: "db failed" });

    await expect(switchRoleToReader()).rejects.toThrow("NEXT_REDIRECT:/author/settings");

    expect(mockCookieSet).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});
