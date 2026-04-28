import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getDiscoveryEnabled: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
}));

vi.mock("@/lib/flags", () => ({
  getDiscoveryEnabled: mocks.getDiscoveryEnabled,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/features/reader/reader-discover/ReaderDiscoverPageView", () => ({
  default: vi.fn(() => null),
}));

const { default: ReaderDiscoverPage } = await import("./page");

describe("ReaderDiscoverPage discovery flag", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns notFound without querying data when discovery is disabled", async () => {
    mocks.getDiscoveryEnabled.mockReturnValue(false);

    await expect(
      ReaderDiscoverPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(mocks.notFound).toHaveBeenCalledTimes(1);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
