import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const mocks = vi.hoisted(() => ({
  enabled: true, allowed: true, status: "draft", owned: true,
  count: 12 as number | null, error: null as { code: string } | null,
  from: vi.fn(), eq: vi.fn(), select: vi.fn(),
}));
vi.mock("@/lib/flags", () => ({ getNewslettersEnabled: () => mocks.enabled }));
vi.mock("@/lib/auth/require-author", () => ({ requireAuthorRole: async () => ({ ok: mocks.allowed, user: { id: "author-1" } }) }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(url); }, notFound: () => { throw new Error("not-found"); } }));
vi.mock("@/components/newsletters/NewsletterComposer", () => ({ default: () => <div>Existing composer</div> }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      mocks.from(table);
      const query = {
        select: (...args: unknown[]) => { mocks.select(table, ...args); return query; },
        eq: (key: string, value: string) => { mocks.eq(table, key, value); return query; },
        single: async () => ({ data: mocks.owned ? { id: "newsletter-1", author_id: "author-1", status: mocks.status, subject: "News", body_html: "", body_text: "", recipient_count: 4, sent_at: null } : null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ count: mocks.count, error: mocks.error }).then(resolve),
      };
      return query;
    },
  }),
}));
const { default: Page } = await import("./page");
const load = () => Page({ params: Promise.resolve({ id: "newsletter-1" }) });
beforeEach(() => {
  vi.clearAllMocks(); Object.assign(mocks, { enabled: true, allowed: true, status: "draft", owned: true, count: 12, error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("newsletter draft audience", () => {
  it("counts only active subscriptions for the authenticated author after owned draft lookup", async () => {
    const html = renderToStaticMarkup(await load());
    expect(html).toContain("12 active subscriptions");
    expect(html).toContain("Existing composer");
    expect(mocks.select).toHaveBeenCalledWith("newsletter_subscriptions", "id", { count: "exact", head: true });
    expect(mocks.eq).toHaveBeenCalledWith("newsletters", "author_id", "author-1");
    expect(mocks.eq).toHaveBeenCalledWith("newsletter_subscriptions", "author_id", "author-1");
    expect(mocks.eq).toHaveBeenCalledWith("newsletter_subscriptions", "status", "active");
  });
  it.each(["error", "missing", "empty"])("distinguishes audience %s without suppressing draft editing", async mode => {
    mocks.count = mode === "empty" ? 0 : null;
    mocks.error = mode === "error" ? { code: "PGRST205" } : null;
    const html = renderToStaticMarkup(await load());
    expect(html).toContain(mode === "empty" ? "No active subscribers yet" : "Count unavailable");
    expect(html).toContain("Existing composer");
  });
  it("does not replace a sent newsletter's recorded recipients with today's count", async () => {
    mocks.status = "sent";
    const html = renderToStaticMarkup(await load());
    expect(html).not.toContain("All active subscribers");
    expect(mocks.from).not.toHaveBeenCalledWith("newsletter_subscriptions");
  });
  it.each(["disabled", "signed-out", "foreign"])("never loads the audience for %s access", async reason => {
    if (reason === "disabled") mocks.enabled = false;
    if (reason === "signed-out") mocks.allowed = false;
    if (reason === "foreign") mocks.owned = false;
    await expect(load()).rejects.toThrow();
    expect(mocks.from).not.toHaveBeenCalledWith("newsletter_subscriptions");
  });
});
