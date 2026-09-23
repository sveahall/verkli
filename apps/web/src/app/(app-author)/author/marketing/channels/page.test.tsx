import { expect, it, vi } from "vitest";
const auth = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/require-author", () => ({ requireAuthorRole: auth }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(url); } }));
vi.mock("@/components/marketing/ChannelConnections", () => ({ ChannelConnections: () => null }));
const { default: Page } = await import("./page");
it("requires the existing author access before rendering connection management", async () => {
  auth.mockResolvedValue({ ok: false }); await expect(Page()).rejects.toThrow("/author/signin");
  auth.mockResolvedValue({ ok: true, user: { id: "author" } }); expect(await Page()).toBeTruthy();
});
