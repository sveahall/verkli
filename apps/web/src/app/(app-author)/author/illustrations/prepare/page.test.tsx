import { beforeEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/lib/auth/require-author", () => ({ requireAuthorRole: f.auth }));
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("SIGN_IN"); } }));
vi.mock("@/features/illustration-preparation/AuthorPreparation", () => ({ default: () => null }));
import Page from "./page";
beforeEach(() => vi.resetAllMocks());
it("requires author access before showing the local tool", async () => {
  f.auth.mockResolvedValue({ ok: false }); await expect(Page()).rejects.toThrow("SIGN_IN");
});
it("binds the local workspace to the admitted account", async () => {
  f.auth.mockResolvedValue({ ok: true, user: { id: "owner" } });
  const result = await Page(); expect(result.props.ownerId).toBe("owner"); expect(result.key).toBe("owner");
});
