import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRedirect = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT:${path}`);
});
const mockRequireAdminRole = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

vi.mock("@/lib/admin-auth", () => ({
  requireAdminRole: mockRequireAdminRole,
}));

const { requireAdminPageAccess } = await import("./admin-page-auth");

describe("requireAdminPageAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the admin user for authorized pages", async () => {
    mockRequireAdminRole.mockResolvedValue({
      ok: true,
      user: { id: "admin-1" },
      profileRole: "admin",
    });

    await expect(requireAdminPageAccess()).resolves.toEqual({ id: "admin-1" });
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("redirects unauthenticated users to reader sign-in", async () => {
    mockRequireAdminRole.mockResolvedValue({
      ok: false,
      error: "UNAUTHORIZED",
      status: 401,
      profileRole: null,
    });

    await expect(requireAdminPageAccess()).rejects.toThrow(
      "NEXT_REDIRECT:/reader/signin"
    );
  });

  it("redirects non-admin authors to author home", async () => {
    mockRequireAdminRole.mockResolvedValue({
      ok: false,
      error: "FORBIDDEN",
      status: 403,
      profileRole: "author",
    });

    await expect(requireAdminPageAccess()).rejects.toThrow(
      "NEXT_REDIRECT:/author/home?error=admin_required"
    );
  });

  it("redirects non-admin readers to reader home", async () => {
    mockRequireAdminRole.mockResolvedValue({
      ok: false,
      error: "FORBIDDEN",
      status: 403,
      profileRole: "reader",
    });

    await expect(requireAdminPageAccess()).rejects.toThrow(
      "NEXT_REDIRECT:/reader/home?error=admin_required"
    );
  });
});
