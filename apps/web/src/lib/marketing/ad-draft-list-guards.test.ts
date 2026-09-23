import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ from: vi.fn(), postIds: vi.fn() }));
vi.mock("@/lib/auth/require-author-marketing", () => ({ requireAuthorAndMarketingEnabled: async () => ({ user: { id: "author" } }) }));
vi.mock("@/lib/billing/server", () => ({ requireProBillingForApi: vi.fn() }));
vi.mock("@/lib/marketing-queue", () => ({ enqueueMarketingJob: vi.fn() }));
vi.mock("@/lib/marketing/queue-readiness", () => ({ getMarketingQueueReadiness: vi.fn() }));
vi.mock("@/lib/flags", () => ({ getMarketingEnabled: () => true }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/features/author-workspaces/marketing/MarketingPortalView", () => ({ default: () => null }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: mock.from, auth: { getUser: async () => ({ data: { user: { id: "author" } } }) } }) }));
import { GET } from "@/app/api/author/marketing/campaigns/route";
import Page from "@/app/(app-author)/author/marketing/page";

beforeEach(() => {
  vi.clearAllMocks();
  mock.from.mockImplementation((table: string) => {
    let excludeDrafts = false;
    const plans = [
      { id: "ordinary", book_id: "book", paid_config: {}, books: { title: "Book" } },
      { id: "paid-campaign", book_id: "book", paid_config: { objective: "traffic" } },
      { id: "draft", book_id: "book", paid_config: { kind: "ad_draft", version: 1 } },
      { id: "future-draft", book_id: "book", paid_config: { kind: "ad_draft", version: 999 } },
    ];
    const q = {
      select: () => q, eq: () => q, order: () => q,
      not: (column: string, operator: string, value: string) => {
        excludeDrafts = column === "paid_config" && operator === "cs" && JSON.parse(value).kind === "ad_draft";
        return q;
      },
      in: (_column: string, ids: string[]) => { mock.postIds(ids); return q; },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({
        data: table === "books" ? [{ id: "book", title: "Book" }]
          : table === "marketing_campaign_plans" ? plans.filter(plan => !excludeDrafts || plan.paid_config.kind !== "ad_draft")
            : [{ campaign_plan_id: "ordinary", status: "posted" }], error: null,
      }).then(resolve),
    };
    return q;
  });
});
describe("ad draft isolation from runnable campaign lists", () => {
  it("excludes all draft versions before API post counting, retaining ordinary paid campaigns", async () => {
    const response = await GET(new Request("http://localhost/campaigns"));
    expect(response.status).toBe(200);
    expect((await response.json()).campaigns.map((row: { id: string }) => row.id)).toEqual(["ordinary", "paid-campaign"]);
    expect(mock.postIds).toHaveBeenCalledExactlyOnceWith(["ordinary", "paid-campaign"]);
  });
  it("also excludes drafts before server-rendered cards and post counting", async () => {
    const page = await Page({});
    expect(page.props.campaigns.map((row: { id: string }) => row.id)).toEqual(["ordinary", "paid-campaign"]);
    expect(mock.postIds).toHaveBeenCalledExactlyOnceWith(["ordinary", "paid-campaign"]);
  });
});
