import { afterEach, expect, it, vi } from "vitest";
import { useMarketing } from "./useMarketing";

vi.mock("react", () => ({
  useState: (value: unknown) => [value, vi.fn()],
  useCallback: (callback: unknown) => callback,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/ui/toast", () => ({ useToastHelpers: () => ({ error: vi.fn() }) }));
vi.mock("../BookEditorView.helpers", () => ({ MARKETING_CHANNELS: [], MARKETING_CHANNEL_LABELS: {} }));
afterEach(() => vi.restoreAllMocks());

it("sends the clicked channel and language even before parent state has rerendered", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({}));
  const marketing = useMarketing({
    book: { id: "book-1", language: "en" } as never,
    marketingCampaigns: [],
    activeVersion: null,
  });
  marketing.setMarketingChannel("instagram");
  marketing.setMarketingLanguage("sv");
  await marketing.handleGenerateMarketingCopy("instagram", "sv");
  expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).toEqual({ channel: "instagram", language: "sv" });
});
