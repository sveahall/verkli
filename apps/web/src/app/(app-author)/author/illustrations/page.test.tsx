import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const f = vi.hoisted(() => ({ auth: vi.fn(), client: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/auth/require-author", () => ({ requireAuthorRole: f.auth }));
vi.mock("@/lib/supabase/server", () => ({ createClient: f.client }));
vi.mock("@/lib/illustration-picker/read", async (original) => ({ ...await original<typeof import("@/lib/illustration-picker/read")>(), readPicker: f.read }));
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("SIGN_IN"); } }));
import Page from "./page";
beforeEach(() => { vi.resetAllMocks(); vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());
it("requires author approval before any selection query", async () => {
  f.auth.mockResolvedValue({ ok: false }); await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow("SIGN_IN"); expect(f.client).not.toHaveBeenCalled(); expect(f.read).not.toHaveBeenCalled();
});
it("shows a recoverable error without exposing database details", async () => {
  f.auth.mockResolvedValue({ ok: true, user: { id: "owner" } }); f.read.mockRejectedValue(new Error("secret server details"));
  const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) })); expect(html).toContain("Restart selection"); expect(html).not.toContain("secret"); expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("secret");
});
it("rejects duplicate or malformed query values before querying", async () => {
  f.auth.mockResolvedValue({ ok: true, user: { id: "owner" } });
  const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ book: ["a", "b"] }) })); expect(html).toContain("Choose a valid book"); expect(f.client).not.toHaveBeenCalled();
});
