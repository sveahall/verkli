import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({
  user: { id: "author-1" } as { id: string } | null,
  plan: { id: "campaign-1", book_id: "book-1", name: "Book launch" } as Record<string, unknown> | null,
  posts: { data: [] as Array<Record<string, unknown>> | null, error: null as { code: string; message: string } | null },
  from: vi.fn(),
  eq: vi.fn(),
}));
vi.mock("@/lib/flags", () => ({ getMarketingEnabled: () => true }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`redirect:${url}`); },
  notFound: () => { throw new Error("not-found"); },
}));
vi.mock("@/features/author-workspaces/marketing/CampaignDetailView", () => ({
  default: ({ posts }: { posts: unknown[] }) => <div>Loaded posts: {posts.length}</div>,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mocks.user } }) },
    from: (table: string) => {
      mocks.from(table);
      const query = {
        select: () => query,
        eq: (key: string, value: string) => { mocks.eq(table, key, value); return query; },
        maybeSingle: async () => ({ data: table === "marketing_campaign_plans" ? mocks.plan : { title: "A book" } }),
        order: async () => mocks.posts,
      };
      return query;
    },
  }),
}));
const { default: Page } = await import("./page");
const load = () => Page({ params: Promise.resolve({ id: "campaign-1" }) });

describe("campaign post loading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = { id: "author-1" };
    mocks.plan = { id: "campaign-1", book_id: "book-1", name: "Book launch" };
    mocks.posts = { data: [], error: null };
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("shows a safe error and real reload action instead of a false empty campaign", async () => {
    mocks.posts = { data: null, error: { code: "08006", message: "private database connection detail" } };
    const html = renderToStaticMarkup(await load());
    expect(html).toContain("Could not load campaign posts");
    expect(html).toContain('role="alert"');
    expect(html).toContain('action="/author/marketing/campaign-1"');
    expect(html).toContain('method="get"');
    expect(html).toContain("Try again");
    expect(html).toContain("Book launch");
    expect(html).not.toContain("Loaded posts:");
    expect(html).not.toContain("private database connection detail");
    expect(console.error).toHaveBeenCalledWith("[marketing campaign] Could not load posts", { campaignId: "campaign-1", code: "08006" });
  });

  it("renders the existing view again after a successful retry, including a truly empty campaign", async () => {
    mocks.posts = { data: null, error: { code: "08006", message: "unavailable" } };
    await load();
    mocks.posts = { data: [], error: null };
    expect(renderToStaticMarkup(await load())).toContain("Loaded posts: 0");
    mocks.posts = { data: [{ id: "post-1", caption: "Saved copy" }], error: null };
    const page = await load();
    expect(page.props.posts).toEqual([expect.objectContaining({ id: "post-1", caption: "Saved copy" })]);
    expect(renderToStaticMarkup(page)).toContain("Loaded posts: 1");
  });

  it("checks author ownership before loading posts and never renders a foreign campaign", async () => {
    mocks.plan = null;
    await expect(load()).rejects.toThrow("not-found");
    expect(mocks.eq).toHaveBeenCalledWith("marketing_campaign_plans", "id", "campaign-1");
    expect(mocks.eq).toHaveBeenCalledWith("marketing_campaign_plans", "author_id", "author-1");
    expect(mocks.from).not.toHaveBeenCalledWith("marketing_posts");
  });

  it("redirects signed-out users before querying campaigns or posts", async () => {
    mocks.user = null;
    await expect(load()).rejects.toThrow("redirect:/author/signin");
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
